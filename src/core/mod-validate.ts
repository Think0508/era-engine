// 模组数据校验 + 关系/字符规范化（2026-08-15 E1 拆分——mod-loader 校验段独立）
// 依赖方向：mod-types ← mod-validate ← mod-parse ← mod-loader（无环）
// ⚠️ 本文件对 modLoader 的引用是懒引用（函数体内）——mod-loader 循环依赖（既有先例
// character-contract ↔ mod-loader），模块求值期不触碰 modLoader 实例
import { errorReporter } from './error-reporter'
import { useRegistry } from './use-registry'
import { getCharacterValidators, validateTopLevelLayers } from './character-contract'
import { modLoader } from './mod-loader'
import type { LoadedMod, RelationTypeDef, RelationGroupDef, Quest, UpgradeNeed } from './mod-types'

export function validateCharacterContract(mod: LoadedMod, modName: string): void {
  const characters = mod.entities.get('character')
  if (!characters) return

  const knownAttrs = new Set(Object.keys(mod.attributes))
  const knownAbilities = new Set(Object.keys(mod.abilities))
  const knownTalents = new Set(Object.keys(mod.talentDefs))
  const knownStatus = new Set(Object.keys(mod.statusEffects))
  const knownRelations = new Set(Object.keys(mod.relationTypes))

  // category 命名空间（social/economy/combat…）动态纳入分层已知集
  const categoryNamespaces = new Set<string>()
  const attrNsMap: Record<string, string> = { parameter: 'params', mark: 'marks', ability: 'abilities' }
  for (const def of Object.values(mod.attributes)) {
    categoryNamespaces.add(attrNsMap[def.category] ?? def.category)
  }

  // 属性承载命名空间：只允许已定义键（裸字段 = 契约违规）
  const attributeNamespaces: Array<[string, Set<string>]> = [
    ['base', knownAttrs],
    ['params', knownAttrs],
    ['marks', knownAttrs],
    ['abilities', new Set([...knownAbilities, ...knownAttrs])],
    ['talents', knownTalents],
  ]

  for (const [charId, rawChar] of characters) {
    const char = rawChar as Record<string, any>

    // ① 裸字段检查
    for (const [ns, known] of attributeNamespaces) {
      const container = char[ns]
      if (!container || typeof container !== 'object') continue
      for (const key of Object.keys(container)) {
        if (known.has(key)) continue
        errorReporter.report({
          source: 'mod-loader',
          severity: 'warning',
          file: `mods/${modName}/characters/`,
          message: `角色 '${charId}' 使用了未定义的属性 '${key}'（命名空间 ${ns}）`,
          suggestion: `契约铁律：角色数据禁止裸字段——请先在 definitions/attributes.toml（或 abilities/talents.toml）定义 '${key}'，或在角色数据中删除该键`,
        })
      }
    }
    // status_effects 引用定义
    for (const eff of (char.status_effects ?? []) as any[]) {
      if (eff?.id && !knownStatus.has(eff.id)) {
        errorReporter.report({
          source: 'mod-loader',
          severity: 'warning',
          file: `mods/${modName}/characters/`,
          message: `角色 '${charId}' 使用了未定义的状态效果 '${eff.id}'`,
          suggestion: '状态效果需在 definitions/status-effects.toml 定义',
        })
      }
    }
    // relations 引用定义
    if (char.relations && typeof char.relations === 'object') {
      for (const [targetId, relType] of Object.entries(char.relations)) {
        if (!relType || typeof relType !== 'object') continue
        for (const typeName of Object.keys(relType)) {
          if (!knownRelations.has(typeName)) {
            errorReporter.report({
              source: 'mod-loader',
              severity: 'warning',
              file: `mods/${modName}/characters/`,
              message: `角色 '${charId}' 使用了未定义的关系类型 '${typeName}'`,
              suggestion: '关系类型需在 definitions/relations.toml 定义',
            })
            continue
          }
          // 注释：reverse 不对称检查（关系系统 v2）——A 有 kind=relation 类型 T 对 B，
          // T.reverse（或同名换端自动推导）=R → 提示 B 侧是否应有 R（单方面关系合法——仅提示确认，不阻止）
          const def = mod.relationTypes[typeName]
          const rev = def?.kind === 'relation' ? resolveReverseType(typeName, def) : undefined
          if (rev) {
            const targetChar = characters.get(targetId) as Record<string, any> | undefined
            if (targetChar && !targetChar.relations?.[charId]?.[rev]) {
              errorReporter.report({
                source: 'mod-loader',
                severity: 'warning',
                file: `mods/${modName}/characters/`,
                message: `角色 '${charId}' 视 '${targetId}' 为 '${typeName}'，但 '${targetId}' 侧没有对 '${charId}' 的 '${rev}'`,
                suggestion: `若是单方面关系（如单恋/失散）可忽略；若应双向，请在 '${targetId}' 的 relations 中补写`,
              })
            }
          }
        }
      }
    }

    // ①.5 字段分层检查（ADR-0007：L3 引擎独占 / L2 非平凡 / 未知顶层键）
    validateTopLevelLayers(charId, rawChar, mod, categoryNamespaces)

    // ② 插件注册的校验器（具体字段契约在插件层）
    for (const validator of getCharacterValidators()) {
      try {
        validator.validate(charId, rawChar, mod)
      } catch (e) {
        // 校验器自身异常不允许拖垮加载（契约：校验失败 warning，不 throw）
        errorReporter.report({
          source: `character-contract:${validator.id}`,
          severity: 'warning',
          message: `角色 '${charId}' 契约校验异常：${e instanceof Error ? e.message : String(e)}`,
        })
      }
    }
  }
}

/**
 * 角色契约校验补跑（启动顺序兼容，spec §10.1 决策 11a）：
 * main.ts 实际顺序 = loadMod（先）→ 插件 onLoad（后）——首次加载时插件校验器未注册，
 * 必需集校验永不执行。插件（h-core）注册校验器后调用本函数补跑已加载 mod 的角色。
 * 插件先行的启动顺序（AGENTS 文档序）无需补跑（parseModData 时校验器已注册）。
 */
export function revalidateCharacterContract(): void {
  const mod = modLoader.getMod()
  if (!mod) return
  validateCharacterContract(mod, mod.id)
}

/**
 * 物品 use 值重校验（启动顺序兼容，与 revalidateCharacterContract 同模式）：
 * main.ts 实际顺序 = loadMod（先）→ 插件 onLoad（后）——模组数据加载时插件自定义 use
 * （h_drug/h_toy/h_special 等）尚未注册，解析阶段校验会误报。插件注册 use 后调用本函数
 * 补跑（只检查 mod 层物品，插件默认层由各自插件负责）。插件先行的启动顺序（AGENTS
 * 文档序）无需补跑（parseModData 时 use 已注册）。幂等：可重复调用，无新增注册不会补报。
 */
export function revalidateItemUses(): void {
  const mod = modLoader.getMod()
  if (!mod?.items) return
  const modLayerIds = mod.modItemLayerIds
  if (!modLayerIds) return
  for (const itemId of modLayerIds) {
    const def = mod.items[itemId]
    if (!def) continue
    const useList = Array.isArray(def.use) ? def.use : typeof def.use === 'string' ? [def.use] : []
    for (const u of useList) {
      if (!useRegistry.has(u)) {
        errorReporter.report({
          source: 'mod-loader',
          severity: 'warning',
          message: `物品 '${itemId}' 的 use 值 '${u}' 未注册（插件注册后重校验）——无默认 UI 入口，请用指令或插件注册`,
        })
      }
    }
  }
}

export function validateSceneSteps(scene: Quest, file?: string): number {
  if (!Array.isArray(scene.steps)) return 0
  let errCount = 0
  const stepIds = new Set<string>()
  for (const step of scene.steps) {
    if (step && typeof step === 'object' && typeof step.id === 'string') stepIds.add(step.id)
  }
  // 注释：步骤 id 重复检查
  const seenIds = new Set<string>()
  for (const step of scene.steps) {
    if (!step || typeof step !== 'object') {
      errorReporter.report({
        source: 'mod-loader', severity: 'error', file,
        message: `任务 '${scene.id}' 的 steps 含有非法条目（非表对象）`,
        suggestion: 'steps 数组的每个条目必须是表（{ id, type, ... }）',
      })
      errCount++
      continue
    }
    if (typeof step.id !== 'string' || !step.id) {
      errorReporter.report({
        source: 'mod-loader', severity: 'error', file,
        message: `任务 '${scene.id}' 存在缺 id 的步骤`,
        suggestion: '每个步骤必须有唯一 id（executeStep 按 id 定位）',
      })
      errCount++
      continue
    }
    if (seenIds.has(step.id)) {
      errorReporter.report({
        source: 'mod-loader', severity: 'error', file,
        message: `任务 '${scene.id}' 存在重复的步骤 id '${step.id}'`,
        suggestion: '同场景内步骤 id 必须唯一（advanceToStep/executeStep 按 id 定位）',
      })
      errCount++
      continue
    }
    seenIds.add(step.id)
    // 注释：引用字段校验——next/on_win/on_lose 空串 = 显式结束标记（合法）；
    // 非空引用必须指向存在的步骤（原静默：next 失效走"提前完成"、combat 胜利走
    // 挂起、else/goto 失效走挂起——作者无感知，audit-e I3）
    const refs: Record<string, string | undefined> = {
      next: step.next,
      on_win: (step as any).on_win,
      on_lose: (step as any).on_lose,
      else: (step as any).else,
      on_fail: (step as any).on_fail,
      'goto.target': step.type === 'goto' ? (step as any).target : undefined,
    }
    const obj = step.objective as any
    // 注释：F-6——objective.on_fail 存在时（无论类型）加入引用校验——
    // 原仅 string 才查：数字/对象 on_fail 漏检 → 运行时 truthy 推进到不存在的
    // 步骤 → 静默完成（错误完成而非走失败分支）
    if (step.type === 'objective' && obj && typeof obj === 'object' && obj.on_fail != null) {
      refs['objective.on_fail'] = obj.on_fail
    }
    for (const [field, ref] of Object.entries(refs)) {
      if (ref === undefined || ref === null) continue
      if (typeof ref !== 'string') {
        errorReporter.report({
          source: 'mod-loader', severity: 'error', file,
          message: `任务 '${scene.id}' 步骤 '${step.id}' 的 ${field} 必须是字符串（当前是 ${typeof ref}）`,
          suggestion: `${field} 应指向本场景内已定义的步骤 id`,
        })
        errCount++
        continue
      }
      const isEndMarker = (field === 'next' || field === 'on_win' || field === 'on_lose') && ref === ''
      if (isEndMarker) continue
      // 注释：F-10——goto.target 空串只报"缺 target"一条（missing-target 检查
      // 已覆盖空串语义），避免与"引用了不存在的步骤 ''"双报
      if (field === 'goto.target' && ref === '') continue
      if (!stepIds.has(ref)) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error', file,
          message: `任务 '${scene.id}' 步骤 '${step.id}' 的 ${field} 引用了不存在的步骤 '${ref}'`,
          suggestion: `${field} 必须指向本场景内已定义的步骤 id（可用：${Array.from(stepIds).join('、')}）；显式结束场景请用空字符串（next = ""）`,
        })
        errCount++
      }
    }
    // 注释：objective 步骤的 objective 字段必须是含 string type 的表对象——
    // 原只拦 falsy：objective = "foo"（非空字符串）通过校验，运行时 obj.type
    // undefined → 永不匹配 → 场景挂起零诊断（audit-f F-6）
    if (step.type === 'objective') {
      if (!obj || typeof obj !== 'object' || typeof obj.type !== 'string' || !obj.type) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error', file,
          message: `任务 '${scene.id}' 的 objective 步骤 '${step.id}' 的 objective 字段非法（需为含 string type 的表对象）`,
          suggestion: 'objective = { type = "reach_location", ... }（否则目标永不达成，场景挂起）',
        })
        errCount++
      }
    }
    // 注释：dialogue 步骤的 lines 必须为数组（audit-f F-7——字符串 lines 运行时
    // 逐字符输出零报错；内嵌对话节点已有同类校验，此处补步骤级）
    if (step.type === 'dialogue' && (step as any).lines != null && !Array.isArray((step as any).lines)) {
      errorReporter.report({
        source: 'mod-loader', severity: 'error', file,
        message: `任务 '${scene.id}' 的 dialogue 步骤 '${step.id}' 的 lines 必须是数组（当前是 ${typeof (step as any).lines}）`,
        suggestion: 'lines = ["旁白文本", ...]（字符串会逐字符输出）',
      })
      errCount++
    }
    // 注释：combat 步骤必须有出路（next 或 on_win/on_lose）——否则胜利后静默挂起
    if (step.type === 'combat') {
      // 注释：F-2——空串结束标记也是出路（next="" 胜即结束场景）——原 !! 判定
      // 把 "" 误判为无出路（加载期假阳性，运行时 next != null 完全支持）
      const hasWayOut = step.next != null || (step as any).on_win != null || (step as any).on_lose != null
      if (!hasWayOut) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error', file,
          message: `任务 '${scene.id}' 的 combat 步骤 '${step.id}' 未声明 next / on_win / on_lose 任一`,
          suggestion: '战斗结束后需要出路——声明 next（通用推进）或 on_win/on_lose（分胜负推进），否则胜利后任务挂起',
        })
        errCount++
      }
      // 注释：combat 步骤 enemies 非空（audit-e I10——空/缺失 enemies → 战斗秒胜直通，数据错误静默成功）
      if (!Array.isArray((step as any).enemies) || (step as any).enemies.length === 0) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error', file,
          message: `任务 '${scene.id}' 的 combat 步骤 '${step.id}' 的 enemies 为空或缺失`,
          suggestion: 'combat 步骤需声明 enemies = ["角色ID", ...]（空敌人列表会秒胜直通）',
        })
        errCount++
      }
    }
    // 注释：goto 步骤必须有 target（缺失 → 静默挂起）
    if (step.type === 'goto' && !(step as any).target) {
      errorReporter.report({
        source: 'mod-loader', severity: 'error', file,
        message: `任务 '${scene.id}' 的 goto 步骤 '${step.id}' 缺少 target 字段`,
        suggestion: 'goto 步骤需声明 target = 目标步骤 id（否则静默挂起）',
      })
      errCount++
    }
  }
  return errCount
}

// 注释：展开角色 abilities 简写（数字→{level, xp:0}），已是对象则保持
// 2026-08-11（ADR-0009 后续批）：按需展开——不再全量注入所有能力定义（几百技能 × NPC 会
// 撑爆存档）。角色卡能力（感度/刻印/性技）由 attributes.toml category=ability 条目的默认值
// 落位保证（applyAttributeDefaults 先于本函数执行）；mod 技能仅当角色数据写了才存在；
// 存档读档不经过本函数（存档权威，全量条目保留）。未拥有的能力在 getByTag/checkUpgrade/
// 条件路径中语义 = 0 级（缺失即 0）。
// 例外（2026-08-11 联动修复）：mode="condition" 的能力**必须全量注入 0 级条目**——
// checkUpgrade 遍历 char.abilities 做条件升级（经验/宝珠门槛），无条目 = 永不升级（静默）。
// 经验→能力升级链路依赖此保证；xp 模式按需（获得/解锁时才建条目）。
// per-char 版本（运行时生成角色也走同一逻辑，见 finalizeCharacterData）
export function resolveReverseType(typeName: string, def: RelationTypeDef | undefined): string | undefined {
  if (def?.reverse) return def.reverse
  if (typeName.endsWith('（为大）')) return `${typeName.slice(0, -4)}（为小）`
  if (typeName.endsWith('（为小）')) return `${typeName.slice(0, -4)}（为大）`
  return undefined
}

// 注释：关系三档转换（关系系统 v2，2026-08-10）——
// kind=relation 类型：角色数据写 "正面"/"中立"/"负面"（推荐）或 1/0/-1（脚本用），
// 统一存 -1/0/1。非法值 → errorReporter error（禁止静默失败），值原样保留。
const SENTIMENT_MAP: Record<string, number> = { '正面': 1, '中立': 0, '负面': -1 }

export function normalizeRelations(char: any, relationTypes: Record<string, RelationTypeDef>, file?: string): void {
  if (!char.relations || typeof char.relations !== 'object') return
  const reportFile = file ?? ''
  for (const rels of Object.values(char.relations) as Record<string, any>[]) {
    if (!rels || typeof rels !== 'object') continue
    for (const [type, value] of Object.entries(rels)) {
      const def = relationTypes[type]
      // kind 未声明 = 默认 sentiment（数值型，兼容现有好感度）——不转换
      if (!def || (def.kind ?? 'sentiment') === 'sentiment') continue
      if (typeof value === 'string') {
        const num = SENTIMENT_MAP[value]
        if (num !== undefined) {
          rels[type] = num
        } else {
          errorReporter.report({
            source: 'mod-loader',
            severity: 'error',
            file: reportFile,
            message: `关系 '${type}' 的档位值 '${value}' 非法（kind=relation 类型只接受 正面/中立/负面 或 1/0/-1）`,
            suggestion: '修正角色数据中的关系档位值',
          })
        }
      } else if (typeof value === 'number' && value !== -1 && value !== 0 && value !== 1) {
        errorReporter.report({
          source: 'mod-loader',
          severity: 'error',
          file: reportFile,
          message: `关系 '${type}' 的档位值 ${value} 非法（kind=relation 类型只接受 正面/中立/负面 或 1/0/-1）`,
          suggestion: '修正角色数据中的关系档位值',
        })
      }
    }
  }
}

// 注释：关系组展开（关系系统 v2）——组元素 { pair } 引用展开为引用该 pair 的
// 所有已定义类型名（这样内置组（血亲等）不依赖 mod 的具体类型命名）。
// 未知 pair 引用 → throw（阻止加载）。
export function normalizeRelationGroups(mod: LoadedMod, rawGroups: Record<string, RelationGroupDef>): Record<string, string[]> {
  const file = `mods/${mod.id}/definitions/relations.toml`
  const result: Record<string, string[]> = {}
  for (const [groupName, items] of Object.entries(rawGroups)) {
    const flat: string[] = []
    for (const item of items ?? []) {
      if (typeof item === 'string') {
        flat.push(item)
      } else if (item && typeof item === 'object' && typeof item.pair === 'string') {
        if (!mod.relationPairs[item.pair]) {
          throw new Error(`${file}: 关系组 '${groupName}' 引用了不存在的 pair '${item.pair}'`)
        }
        for (const [typeName, def] of Object.entries(mod.relationTypes)) {
          if (def.pair === item.pair) flat.push(typeName)
        }
      }
    }
    result[groupName] = flat
  }
  return result
}

// 注释：关系定义校验（关系系统 v2）——引用错误 throw（阻止加载，同 validateTalents）
// ① kind/side 取值合法 ② relation 型的 pair 引用存在 ③ reverse 指向存在 ④ 组内类型/pair 存在
export function validateRelations(mod: LoadedMod, modName: string): void {
  const file = `mods/${modName}/definitions/relations.toml`
  for (const [typeName, def] of Object.entries(mod.relationTypes)) {
    if (def.kind !== undefined && def.kind !== 'sentiment' && def.kind !== 'relation') {
      throw new Error(`${file}: 关系类型 '${typeName}' 的 kind='${def.kind}' 非法（sentiment 数值型 / relation 三档型）`)
    }
    if (def.side !== undefined && def.side !== 'big' && def.side !== 'small') {
      throw new Error(`${file}: 关系类型 '${typeName}' 的 side='${def.side}' 非法（big 大端 / small 小端；对称类型省略）`)
    }
    if (def.pair !== undefined && !mod.relationPairs[def.pair]) {
      throw new Error(`${file}: 关系类型 '${typeName}' 引用了不存在的 pair '${def.pair}'（请先在 [pairs] 段定义）`)
    }
    if (def.reverse !== undefined && !mod.relationTypes[def.reverse]) {
      throw new Error(`${file}: 关系类型 '${typeName}' 的 reverse 指向了不存在的类型 '${def.reverse}'`)
    }
  }
  for (const [pairName] of Object.entries(mod.relationPairs)) {
    // pairs 是称呼词表资源——不强制被类型引用（mod 可先定义词表后定义类型）
    void pairName
  }
  // 注释：组校验——展开后的组是纯类型名列表（{pair} 引用已在 normalizeRelationGroups 校验）
  for (const [groupName, typeNames] of Object.entries(mod.relationGroups)) {
    for (const typeName of typeNames) {
      if (!mod.relationTypes[typeName]) {
        throw new Error(`${file}: 关系组 '${groupName}' 引用了不存在的类型 '${typeName}'`)
      }
    }
  }
}

// 注释：inventory 归一化（2026-08-09 example-mod 验证暴露的真问题）——
// 运行时 API（inventory-system add/remove/use、hunger、set-system、h-bondage）全部用
// 数组形式 [{itemId, count}]；角色数据/旧文档的对象写法 { 物品ID: count } 加载时不转换
// → addItem/removeItem/饥饿/套装检查对对象调用 .find/.some 抛 TypeError（崩溃链），
// 且条件路径 inventory.{item}.count 恒 false。加载时统一转为数组（幂等）。
export function normalizeMarksToAbilities(char: any, mod?: LoadedMod): void {
  if (!char) return
  if (!char.abilities) char.abilities = {}
  const attributes = mod?.attributes
  if (attributes) {
    for (const [attrName, def] of Object.entries(attributes)) {
      if (def.category !== 'mark') continue
      if (char.abilities[attrName] === undefined) {
        char.abilities[attrName] = { level: 0, xp: 0 }
      }
    }
  }
  const rawMarks = char.marks
  if (!rawMarks || typeof rawMarks !== 'object') return
  for (const [markName, value] of Object.entries(rawMarks) as [string, any][]) {
    if (typeof value !== 'number' || value <= 0) continue
    const existing = char.abilities[markName]
    if (existing && typeof existing === 'object' && (existing.level ?? 0) > 0) continue
    // 注释：⚠️ 2026-08-14 第七轮审计——覆盖 0 级条目时保留已有 xp（原实现
    // {level: value, xp: 0} 会把 0 级但已有经验的条目 xp 静默清零）
    char.abilities[markName] = { level: value, xp: existing && typeof existing === 'object' ? (existing.xp ?? 0) : 0 }
  }
}

// 注释：校验 location parent 和 graph edge 引用存在
export function validateLocations(mod: LoadedMod, modName: string): void {
  // Validate parent exists
  for (const [id, loc] of mod.locations) {
    if (loc.parent !== null && !mod.locations.has(loc.parent)) {
      throw new Error(
        `mods/${modName}/maps/locations/: 地点 '${id}' 的 parent '${loc.parent}' 不存在`,
      )
    }
  }

  // Validate graph edges reference existing locations
  for (const edge of mod.graph) {
    if (!mod.locations.has(edge.from)) {
      throw new Error(
        `maps/graph/: edge from='${edge.from}' 引用的地点不存在（可用：${[...mod.locations.keys()].slice(0, 5).join(', ')}...）`,
      )
    }
    if (!mod.locations.has(edge.to)) {
      throw new Error(
        `maps/graph/: edge to='${edge.to}' 引用的地点不存在`,
      )
    }
  }

  // Unreachable warning
  const referencedByOthers = new Set<string>()
  for (const edge of mod.graph) {
    referencedByOthers.add(edge.to)
  }
  for (const [, loc] of mod.locations) {
    if (loc.parent !== null) {
      referencedByOthers.add(loc.id)
    }
  }
  for (const [id, loc] of mod.locations) {
    if (!referencedByOthers.has(id) && loc.parent === null) {
      errorReporter.report({
        source: 'mod-loader',
        severity: 'warning',
        message: `mods/${modName}/maps/locations/: 地点 '${id}' 不可达（无 graph 边指向它，也无 parent）——可能是设计遗漏`,
        suggestion: '检查地图数据：其他地点的 exit 或 parent 应指向它；若为顶级孤立区域，考虑加 parent 或连线',
      })
    }
  }
}

// per-char 版本（运行时生成角色也走同一逻辑，见 finalizeCharacterData）
export function validateTalents(mod: LoadedMod, modName: string): void {
  const defs = mod.talentDefs
  if (Object.keys(defs).length === 0) return
  const characters = mod.entities.get('character')
  if (!characters) return
  for (const [charId, char] of characters) {
    const charTalents = (char as any).talents as Record<string, number> | undefined
    if (!charTalents) continue
    for (const talentId of Object.keys(charTalents)) {
      if (!defs[talentId]) {
        throw new Error(
          `mods/${modName}/characters/: 角色 '${charId}' 使用了未定义的天赋 '${talentId}'（可用：${Object.keys(defs).slice(0, 10).join(', ')}）`,
        )
      }
    }
  }
}

// 注释：能力升级路径校验（2026-08-11 成长系统）——
// ① upgrades 条数超过 max_level → error（值域越界）
// ② needs 引用的 ability/talent id 不存在 → error（对齐 §37 跨文件 ID 引用校验）
// ③ needs 引用的 experience id / ability_sum 的 tag 无匹配 → warning（数字 id 直通无定义文件可查）
export function validateAbilityUpgrades(mod: LoadedMod, _modName: string): void {
  const defs = mod.abilities
  for (const [abilityId, def] of Object.entries(defs)) {
    if (def.mode !== 'condition') continue
    if (!def.upgrades || def.upgrades.length === 0) continue
    if (def.max_level > 0 && def.upgrades.length > def.max_level) {
      errorReporter.report({
        source: 'mod-loader',
        severity: 'error',
        message: `能力 '${abilityId}' 的升级路径 ${def.upgrades.length} 条超过 max_level=${def.max_level}（值域越界，检查 ability-upgrades.toml 或 abilities.toml）`,
      })
    }
    const checkNeed = (need: UpgradeNeed, where: string): void => {
      if (!need) return
      if (need.type === 'ability') {
        if (!defs[need.id as string]) {
          errorReporter.report({
            source: 'mod-loader',
            severity: 'error',
            message: `能力 '${abilityId}' 升级需求引用了不存在的能力 '${need.id}'（${where}）`,
            suggestion: `检查 abilities.toml 是否定义了该能力（可用：${Object.keys(defs).slice(0, 10).join(', ')}）`,
          })
        }
      } else if (need.type === 'talent') {
        if (!mod.talentDefs[need.id as string]) {
          errorReporter.report({
            source: 'mod-loader',
            severity: 'error',
            message: `能力 '${abilityId}' 升级需求引用了不存在的素质 '${need.id}'（${where}）`,
          })
        }
      } else if (need.type === 'experience') {
        // 数字 id 直通（erArk Experience.csv，与 experience 命名空间同序）——无定义文件可机器校验，
        // 常规数据不报（E 需求是 erArk AbilityUp.csv 全量常态；报错只会刷屏）
      } else if (need.type === 'ability_sum') {
        const hasTag = Object.values(defs).some(d => d.tags?.includes(need.tag as string))
        if (!hasTag) {
          errorReporter.report({
            source: 'mod-loader',
            severity: 'warning',
            message: `能力 '${abilityId}' 的聚合判定引用 tag '${need.tag}'，但没有任何能力带此标签（聚合结果恒 0）`,
          })
        }
      }
    }
    for (const [idx, entry] of def.upgrades.entries()) {
      for (const need of entry.needs ?? []) checkNeed(need, `第 ${idx} 级`)
      for (const need of entry.backup_needs ?? []) checkNeed(need, `第 ${idx} 级备选`)
    }
    for (const need of def.extra_needs ?? []) checkNeed(need, '能力级附加判定')
  }
}

