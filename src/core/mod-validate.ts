// 模组数据校验 + 关系/字符规范化（2026-08-15 E1 拆分——mod-loader 校验段独立）
// 依赖方向：mod-types ← mod-validate ← mod-parse ← mod-loader（无环）
// ⚠️ 本文件对 modLoader 的引用是懒引用（函数体内）——mod-loader 循环依赖（既有先例
// character-contract ↔ mod-loader），模块求值期不触碰 modLoader 实例
import { errorReporter } from './error-reporter'
import { useRegistry } from './use-registry'
import { getCharacterValidators, validateTopLevelLayers } from './character-contract'
import { modLoader } from './mod-loader'
import { conditionRegistry } from './condition-registry'
import type { LoadedMod, RelationTypeDef, RelationGroupDef, Quest, UpgradeNeed } from './mod-types'
import { isStackable, hasStackLevelConcept } from './mod-types'
import type { AttributeModSource } from './attribute-eval'

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
        // 聚合过滤二选一：`kind` = 按被动类别（passive_kind：内功/护体/轻功/异术）；`tag` = 按横切标签
        if (typeof need.kind === 'string') {
          const hasKind = Object.values(defs).some(d => (d as any).passive_kind === need.kind)
          if (!hasKind) {
            errorReporter.report({
              source: 'mod-loader',
              severity: 'warning',
              message: `能力 '${abilityId}' 的聚合判定引用被动类别 '${need.kind}'，但没有任何能力声明该 passive_kind（聚合结果恒 0）`,
              suggestion: '被动类别写在能力定义的 passive_kind（内功/护体/轻功/异术）；若想按横切标签聚合请改用 tag',
            })
          }
        } else {
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
    }
    for (const [idx, entry] of def.upgrades.entries()) {
      for (const need of entry.needs ?? []) checkNeed(need, `第 ${idx} 级`)
      for (const need of entry.backup_needs ?? []) checkNeed(need, `第 ${idx} 级备选`)
    }
    for (const need of def.extra_needs ?? []) checkNeed(need, '能力级附加判定')
  }
}

// 注释：能力成长曲线校验（2026-09-23 秘籍-技能系统）——
// 此前 `xp_curve` 无任何加载期校验，未知值在运行期被 `getXpRequired` 静默当 100
// （"写了 curve 却按 100 XP 升级"，无声无息）。现按四种合法值分别校验形状：
//   linear/exponential → xp_per_level 数字（缺省按 100）；custom → 数字数组；
//   geometric → 对象 { base, ratio? }（第 n 级 = base × ratio^(n-1)）。
// 判 error（不是 warning）：曲线写错 = 全部升级数值错，且没有任何运行时信号。
export function validateAbilityXpGrowth(mod: LoadedMod): void {
  const CURVES = ['linear', 'exponential', 'custom', 'geometric']
  for (const [abilityId, def] of Object.entries(mod.abilities ?? {})) {
    const curve = def.xp_curve
    const xp = def.xp_per_level
    if (curve === undefined) {
      // 缺省 linear：只校验显式写过的 xp_per_level（数字或对象都可能是笔误）
      if (xp !== undefined && typeof xp !== 'number') {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `能力 '${abilityId}' 未声明 xp_curve（缺省 linear），但 xp_per_level 不是数字（收到 ${Array.isArray(xp) ? 'array' : typeof xp}）`,
          suggestion: 'linear 用 xp_per_level = 100；要按数组/几何曲线请显式写 xp_curve',
        })
      }
      continue
    }
    if (!CURVES.includes(curve)) {
      errorReporter.report({
        source: 'mod-loader', severity: 'error',
        message: `能力 '${abilityId}' 的 xp_curve '${curve}' 未知（可用：${CURVES.join(' / ')}）`,
        suggestion: '未知曲线在运行期会被当成 100 XP/级（静默错值），故判 error',
      })
      continue
    }
    if (curve === 'custom') {
      if (!Array.isArray(xp) || !xp.every(v => typeof v === 'number' && Number.isFinite(v))) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `能力 '${abilityId}' 的 xp_curve = "custom" 需要 xp_per_level 为有限数字数组`,
          suggestion: '例：xp_per_level = [100, 200, 400, 800]',
        })
      }
    } else if (curve === 'geometric') {
      const spec = xp as { base?: unknown; ratio?: unknown } | undefined
      const base = spec?.base
      const ratio = spec?.ratio
      const badBase = typeof base !== 'number' || !Number.isFinite(base) || base <= 0
      const badRatio = ratio !== undefined && (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio <= 0)
      if (badBase || badRatio) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `能力 '${abilityId}' 的 xp_curve = "geometric" 需要 xp_per_level = { base = 正数, ratio = 正数（可省，缺省 1.15） }`
            + `（收到 base=${String(base)} ratio=${String(ratio)}）`,
        })
      }
    } else if (typeof xp !== 'number' && xp !== undefined) {
      errorReporter.report({
        source: 'mod-loader', severity: 'error',
        message: `能力 '${abilityId}' 的 xp_curve = "${curve}" 需要 xp_per_level 为数字（收到 ${Array.isArray(xp) ? 'array' : typeof xp}）`,
      })
    }
  }
}

// 注释：秘籍定义校验（2026-09-23 秘籍-技能系统）——manual-system 消费的那份数据。
// 逐条判 error 的理由：这些字段写错的结局都是**静默错值**（练不了层、成长发到不存在的属性、
// 层奖励永远拿不到），且没有任何运行时信号。
//   ① 品级不存在 → 经验公式算不出（成本 0 = 白练）
//   ② kind=skill 缺 category / category 无映射 → 每层系数成长发不出去
//   ③ layer 越界/非正 → 该层奖励永不触发（或写出超上限的层）
//   ④ 目标属性未定义 → applyAttrDelta 写进不存在的键（默认值 0 的命名空间里凭空多一个键）
//   ⑤ 引用的 ability/talent 不存在 → 授予静默跳过
//   ⑥ requires / layer_requires.condition 字段路径未注册 → 条件恒假（永远练不了）
//   ⑦ 物品 manual_access.manual 不存在 / cap 非法
export function validateManualDefs(mod: LoadedMod): void {
  const tiers = mod.manualTiers?.tiers ?? {}
  const categoryAttrs = mod.manualTiers?.category_attrs ?? {}
  // 系别 → 系数属性的映射目标也必须是已定义属性：写错了就是"每层成长静默写进一个无人读的键"
  for (const [category, attr] of Object.entries(categoryAttrs)) {
    if (typeof attr !== 'string' || !mod.attributes?.[attr]) {
      errorReporter.report({
        source: 'mod-loader', severity: 'error',
        message: `manual-tiers.toml 的 category_attrs['${category}'] 指向未定义属性 '${String(attr)}'`,
        suggestion: '该秘籍品级表把系别映射到系数属性，映射目标必须先在此 mod 的 attributes.toml（或某插件默认层）定义',
      })
    }
  }
  const checkAttr = (owner: string, attr: unknown, where: string): void => {
    if (typeof attr !== 'string' || !attr) {
      errorReporter.report({
        source: 'mod-loader', severity: 'error',
        message: `${owner} 的 ${where} 缺少 attr（目标属性名）`,
      })
      return
    }
    if (!mod.attributes?.[attr]) {
      errorReporter.report({
        source: 'mod-loader', severity: 'error',
        message: `${owner} 的 ${where} 引用了未定义属性 '${attr}'`,
        suggestion: '该属性需先在 attributes.toml 定义（未定义 = 成长静默写进一个无人读的键）',
      })
    }
  }

  for (const [manualId, def] of Object.entries(mod.manuals ?? {})) {
    const owner = `秘籍 '${manualId}'`
    const maxLayer = typeof def?.max_layer === 'number' ? def.max_layer : 10
    if (!tiers[def?.tier]) {
      errorReporter.report({
        source: 'mod-loader', severity: 'error',
        message: `${owner} 的品级 '${String(def?.tier)}' 在 manual-tiers.toml 中不存在`,
        suggestion: `可用品级：${Object.keys(tiers).join(' / ') || '（该 mod 尚未定义任何品级）'}`,
      })
    }
    const kind = def?.kind ?? 'skill'
    if (kind === 'skill') {
      if (!def?.category) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `${owner} 是技能秘籍（kind 缺省/\"skill\"）但没有 category（武功类别）——每层系数成长无法决定落到哪个属性`,
          suggestion: `补 category = "拳掌" 之类，或显式写 kind = "internal"/"passive"（那两类不做自动系数成长）`,
        })
      } else if (!categoryAttrs[def.category]) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `${owner} 的 category '${def.category}' 在 manual-tiers.toml 的 [manual-tiers.category_attrs] 中没有映射`,
          suggestion: `补映射（如 ${def.category} = "拳掌系数"），或改用 kind = "internal"/"passive"`,
        })
      }
    }
    for (const g of def?.layer_growth ?? []) {
      checkAttr(owner, (g as any)?.attr, 'layer_growth')
      const rg = (g as any)?.range
      if (rg !== undefined) {
        if (!Array.isArray(rg) || rg.length !== 2 || rg.some((v: unknown) => typeof v !== 'number' || !Number.isFinite(v))) {
          errorReporter.report({
            source: 'mod-loader', severity: 'error',
            message: `${owner} 的 layer_growth['${String((g as any)?.attr)}'] 的 range 必须是 [下界, 上界] 两个有限数字`,
          })
        }
      }
    }
    for (const r of def?.layer_rewards ?? []) {
      const layer = (r as any)?.layer
      if (typeof layer !== 'number' || !Number.isInteger(layer) || layer < 1 || layer > maxLayer) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `${owner} 的 layer_rewards 层号非法（收到 ${String(layer)}）——必须在 1..${maxLayer}（max_layer）之间`,
          suggestion: '层号越界的奖励永远不会发放',
        })
      }
      const rAbility = (r as any)?.ability
      if (rAbility !== undefined && !mod.abilities?.[rAbility]) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `${owner} 第 ${String(layer)} 层的奖励引用了不存在的能力 '${String(rAbility)}'`,
          suggestion: `检查 abilities.toml（可用：${Object.keys(mod.abilities ?? {}).slice(0, 8).join('、')}）`,
        })
      }
      const rTalent = (r as any)?.talent
      if (rTalent !== undefined && !mod.talentDefs?.[rTalent]) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `${owner} 第 ${String(layer)} 层的奖励引用了不存在的天赋 '${String(rTalent)}'`,
        })
      }
      for (const a of ((r as any)?.attributes ?? []) as any[]) {
        checkAttr(owner, a?.attr, `第 ${String(layer)} 层的 attributes`)
        if (typeof a?.flat !== 'number' || !Number.isFinite(a.flat)) {
          errorReporter.report({
            source: 'mod-loader', severity: 'error',
            message: `${owner} 第 ${String(layer)} 层的属性奖励 '${String(a?.attr)}' 的 flat 不是有限数字`,
          })
        }
      }
    }
    for (const lr of def?.layer_requires ?? []) {
      const layer = (lr as any)?.layer
      if (typeof layer !== 'number' || !Number.isInteger(layer) || layer < 1 || layer > maxLayer) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `${owner} 的 layer_requires 层号非法（收到 ${String(layer)}）——必须在 1..${maxLayer} 之间`,
        })
      }
      const cond = (lr as any)?.condition
      if (typeof cond !== 'string' || !cond.trim()) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `${owner} 第 ${String(layer)} 层的 layer_requires 缺少 condition`,
        })
      } else {
        const { ok, unknown } = conditionRegistry.validateExpression(cond)
        if (!ok) {
          errorReporter.report({
            source: 'mod-loader', severity: 'error',
            message: `${owner} 第 ${String(layer)} 层的修炼门槛引用了未注册字段/前提：${unknown.join(', ')}（条件：${cond}）`,
            suggestion: '门槛条件恒假 = 这一层永远练不上去；selected. 指修炼者本人',
          })
        }
      }
    }
    if (def?.requires !== undefined) {
      const cond = def.requires
      if (typeof cond !== 'string' || !cond.trim()) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `${owner} 的 requires 必须是非空 condition 表达式`,
        })
      } else {
        const { ok, unknown } = conditionRegistry.validateExpression(cond)
        if (!ok) {
          errorReporter.report({
            source: 'mod-loader', severity: 'error',
            message: `${owner} 的 requires 引用了未注册字段/前提：${unknown.join(', ')}（条件：${cond}）`,
            suggestion: '门槛条件恒假 = 这本秘籍永远练不了；selected. 指修炼者本人',
          })
        }
      }
    }
  }

  // 卷册物品：manual_access 的引用与 cap
  for (const [itemId, def] of Object.entries(mod.items ?? {})) {
    const access = (def as any)?.manual_access
    if (!access) continue
    if (!mod.manuals?.[access.manual]) {
      errorReporter.report({
        source: 'mod-loader', severity: 'error',
        message: `物品 '${itemId}' 的 manual_access.manual '${String(access.manual)}' 不存在`,
        suggestion: `检查 manuals.toml（可用：${Object.keys(mod.manuals ?? {}).slice(0, 8).join('、')}）`,
      })
      continue
    }
    if (access.cap !== undefined) {
      const cap = access.cap
      const manualDef = mod.manuals[access.manual]
      const maxLayer = typeof manualDef.max_layer === 'number' ? manualDef.max_layer : 10
      if (typeof cap !== 'number' || !Number.isInteger(cap) || cap < 1) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `物品 '${itemId}' 的 manual_access.cap 必须是 ≥1 的整数（收到 ${String(cap)}）`,
        })
      } else if (cap > maxLayer) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `物品 '${itemId}' 的 manual_access.cap=${cap} 超过秘籍 '${access.manual}' 的 max_layer=${maxLayer}`,
          suggestion: '残本的 cap 必须 ≤ 秘籍知识上限（否则该值会被 min 静默吃掉，看起来"没生效"）',
        })
      }
    }
  }
}

// 注释：声明式属性修正（attribute_mods）加载期校验（属性有效值层 计划二）——
// 校验引擎真正消费的那份数据（合并后的 items/abilities/talentDefs）。
// 只上报、不抛错：坏声明在运行时被 collectDeclarativeMods 静默跳过（形状不对即忽略），
// 若加载期不留痕，"属性名拼错 / flat 拼成 flats / 装备写了 per_level" 全是无声失效。
// per_level 只允许用在有等级概念的来源（被动技能/天赋）；装备写 → error（不静默当 1 级）。
export function validateAttributeMods(mod: LoadedMod): void {
  // field：校验的字段名（attribute_mods / equipped_mods）——两者形状与消费方式完全相同
  // （equipped_mods 只在装配期间生效，per_level 同样按能力等级缩放），共用同一份校验。
  const check = (owner: string, list: unknown, allowPerLevel: boolean, field = 'attribute_mods'): void => {
    if (list === undefined) return
    if (!Array.isArray(list)) {
      errorReporter.report({
        source: 'mod-loader', severity: 'error',
        message: `${owner} 的 ${field} 必须是数组`,
      })
      return
    }
    for (const entry of list) {
      const m = entry as AttributeModSource | null | undefined
      const attr: unknown = m?.attr
      if (typeof attr !== 'string' || !mod.attributes?.[attr]) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `${owner} 的 ${field} 引用了未定义属性 '${String(attr)}'`,
          suggestion: '该属性需先在 attributes.toml 定义（属性有效值层的闸门以定义为前提，未定义 = 静默不生效）',
        })
        continue
      }
      if (typeof m?.flat !== 'number' && typeof m?.percent !== 'number' && typeof m?.set !== 'number') {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `${owner} 的 ${field}['${attr}'] 至少要给 flat/percent/set 之一`,
          suggestion: '只写 attr 的条目没有任何修正量，运行时会被跳过',
        })
      }
      if (m?.per_level !== undefined && !allowPerLevel) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `${owner} 的 ${field}['${attr}'] 用了 per_level，但该来源没有等级概念`,
          suggestion: 'per_level 只能用在被动技能/天赋这类有等级的定义上',
        })
      }
      // per_level 的类型：非有限数字 = 运行期被 scaleByLevel 当"无缩放"静默吞掉
      // （最可能是 TOML 里写成了字符串 "2"）—— 与本校验器要消灭的 flats/静默失效同一类
      if (m?.per_level !== undefined && (typeof m.per_level !== 'number' || !Number.isFinite(m.per_level))) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `${owner} 的 ${field}['${attr}'] 的 per_level 不是有限数字（收到 ${typeof m.per_level}）`,
          suggestion: 'per_level 必须是数字（最可能是 TOML 里写成了字符串 "2"）；非数字不会参与等级缩放，运行时按无缩放静默处理',
        })
      }
    }
  }
  for (const [id, def] of Object.entries(mod.items ?? {})) {
    check(`物品 '${id}'`, def?.attribute_mods, false)
  }
  for (const [id, def] of Object.entries(mod.abilities ?? {})) {
    check(`能力 '${id}'`, def?.attribute_mods, true)
    // 装配期间的加成（内功等可装配能力）——形状同 attribute_mods，per_level 同样按等级缩放
    check(`能力 '${id}'`, def?.equipped_mods, true, 'equipped_mods')
  }
  for (const [id, def] of Object.entries(mod.talentDefs ?? {})) {
    check(`天赋 '${id}'`, def?.attribute_mods, true)
  }
  // 状态定义（计划三）：生效期间的属性临时修正 + 对其他状态层数的修正 + 层数衰减。
  // 状态**没有等级概念** → attribute_mods 里写 per_level 一律 error（与装备同待遇：不静默当 1 级）。
  for (const [id, def] of Object.entries(mod.statusEffects ?? {})) {
    check(`状态 '${id}'`, def?.attribute_mods, false)
    // 同一声明里同一 attr 出现多条 → **静默只留最后一条**（2026-09-23 审计 Fix 3）：
    // status-system 的 pushAttributeMods 逐条走 `registerRuntimeMod`，其顶替键是 `(id, attr)`
    // 而 id = `status:<状态ID>` → 同一 attr 的第二条把第一条顶掉（探针：flat 25 + percent 0.5
    // 得到有效值 150，且存活条目还带着被丢弃那条的 strength: 25）。
    // 而**装备/天赋**定义的同样两行是**累加**的（collectDeclarativeMods 把每个 attr 条目都 push 进
    // 清单，applyMods 逐条叠加 → 187.5）——一个概念两种结局，且两种写法都"看起来对"。
    // 判 error 而不是静默按最后一条处理：合并成一条与拆成两属性是两种不同的设计意图，只有作者知道要哪个。
    if (Array.isArray(def?.attribute_mods)) {
      const seen = new Set<string>()
      const dups = new Set<string>()
      for (const m of def.attribute_mods) {
        const attr = (m as AttributeModSource | null | undefined)?.attr
        if (typeof attr !== 'string') continue
        if (seen.has(attr)) dups.add(attr)
        else seen.add(attr)
      }
      for (const attr of dups) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `状态 '${id}' 的 attribute_mods 对属性 '${attr}' 声明了多条修正——运行时按 (id, attr) 顶替，只有**最后一条**生效`,
          suggestion: `合并成一条（同一条里 flat/percent/set 可以并存：{ attr = "${attr}", flat = 25, percent = 0.5 }），`
            + '或改写成两个不同属性。注意装备/天赋定义里的同名多条是**累加**的，状态不是——别按累加的直觉写状态',
        })
      }
    }
    // duration：规格要求「状态 duration 必须是有限数字（或 -1 = 永久）」（2026-09-23 审计 Fix 4）。
    // 判据 = `Number.isFinite(duration) && (duration === -1 || duration > 0)`：
    //   · 缺省 → applyStatus 算 `now + undefined` = NaN → expiresAt = NaN → isExpired 恒 false
    //     （**静默永久**），而 remaining 视图也给不出数字（NaN 漏进 UI/条件/API）；
    //   · 字符串 "360" → `now + "360"` 是字符串拼接，同样恒不到期（静默永久）；
    //   · 0 / 负数（-1 之外）→ expiresAt ≤ now = 施加即过期（"配了时长却一挂就没"）。
    // 三种都写成 error：它们在数据上都"看起来配了时长"，结局却与 `-1`（永久）无异或更糟。
    const duration: unknown = def?.duration
    if (!(typeof duration === 'number' && Number.isFinite(duration) && (duration === -1 || duration > 0))) {
      errorReporter.report({
        source: 'mod-loader', severity: 'error',
        message: `状态 '${id}' 的 duration 非法（${duration === undefined ? '缺省' : `收到 ${typeof duration} ${String(duration)}`}）——必须是正有限数字（分钟）或 -1（永久）`,
        suggestion: 'duration = 360（360 分钟后到期）/ duration = -1（永久，剩余时长视图返回 -1）。'
          + '缺省或写成字符串会让 expiresAt 变成 NaN/字符串 = 状态永不到期（静默变永久）；0/负数是"施加即过期"',
      })
    }
    // 叠加声明自洽性（2026-09-22 终审 Fix 2）：`stackable = true` + `max_stack <= 1` 是自相矛盾
    // 的声明——运行时按 isStackable 判（两者必须同时成立）→ 该状态**实际不可叠**，作者写了
    // "可叠"却得到"只刷时长"，且旧的强度判据（只看 stackable）会把它当有层数概念 → 强度取层数。
    // 报 error 而不是静默按不可叠处理：两种解读（改 max_stack / 改 stackable）差一层语义，
    // 只有作者知道要哪个。
    if (def?.stackable === true && !isStackable(def)) {
      errorReporter.report({
        source: 'mod-loader', severity: 'error',
        message: `状态 '${id}' 声明 stackable = true，但 max_stack = ${String(def.max_stack)}（≤ 1）——自相矛盾，运行时按"不可叠"处理`,
        suggestion: '要可叠就把 max_stack 写成 > 1（如 max_stack = 3）；不可叠就删掉 stackable = true（或改为 false）并保留 max_stack = 1。'
          + '注意「打到 N 层」与叠加无关（apply_status 的 stack/stack_add 照常生效），本字段只影响"再施加一次会不会 +1 层"',
      })
    }
    // on_apply_effects 的陷阱显式化（2026-09-22 终审 Fix 1，**裁定：拒绝路径不跑副作用**）：
    // 「打到 N」被拒（N ≤ 当前有效层数）时 applyStatus 直接早退 = 「什么都不发生」（D5 语义，
    // 用户明确要的），**on_apply_effects 一笔都不跑**。spec §7.1 把这两个钩子限定为"一次性、
    // 非属性/非层数"的效果，作者因此很容易把"每次施加都该发生"的意图（如「命中时造成 5 点伤害」）
    // 写进去——一旦被拒就静默吞掉，没有任何运行期信号。这里给加载期 warning 点名该陷阱
    // （不改成拒绝时跑副作用：那会违背 D5「什么都不发生」，且"被拒的攻击仍然扣血"更难解释）。
    // 判据 = 「有层数概念」（可叠 或 会衰减，与 status-system 的强度判定同一份 isStackable/
    // hasStackLevelConcept）：无层数概念的状态走不到"打不动"分支，故不报。
    if (def?.on_apply_effects?.length && hasStackLevelConcept(def)) {
      errorReporter.report({
        source: 'mod-loader', severity: 'warning',
        message: `状态 '${id}' 既有层数概念（可叠/会衰减）又声明了 on_apply_effects——「打到 N」被拒（N ≤ 当前有效层数）时该钩子不会执行（D5「什么都不发生」）`,
        suggestion: 'on_apply_effects 只在**真的施加/顶上**时跑。若意图是"每次施加都发生"，用 tick_effects（周期性）'
          + '或 apply_status 的 stack_add（加法恒生效、不受顶替判定约束）；若只想在被拒时也有反馈，得由发起方（招式/脚本）自己处理',
      })
    }
    // stack_mods：被修正的状态 id 必须已定义（写错 = 一条恒不生效的静默修正），
    // 层数增减必须是非零整数（0 = 没写；小数 = 半层）。
    if (def?.stack_mods !== undefined) {
      if (!Array.isArray(def.stack_mods)) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `状态 '${id}' 的 stack_mods 必须是数组`,
        })
      } else {
        for (const entry of def.stack_mods) {
          const target: unknown = entry?.status
          const value: unknown = entry?.value
          if (typeof target !== 'string' || !mod.statusEffects?.[target]) {
            errorReporter.report({
              source: 'mod-loader', severity: 'error',
              message: `状态 '${id}' 的 stack_mods 引用了未定义状态 '${String(target)}'`,
              suggestion: '被修正层数的状态需先在 definitions/status-effects.toml 定义（未定义 = 该条层数修正静默不生效）',
            })
          }
          if (typeof value !== 'number' || !Number.isInteger(value) || value === 0) {
            errorReporter.report({
              source: 'mod-loader', severity: 'error',
              message: `状态 '${id}' 的 stack_mods['${String(target)}'] 的 value 必须是非零整数（收到 ${String(value)}）`,
              suggestion: '层数是整数：0 等于没写这条修正，小数会让层数出现半层',
            })
          }
        }
      }
    }
    // stack_decay：每 every 分钟 −amount 层 → 两者都必须是正有限数
    // （0/负数 = 永不衰减或层数反向增长，都是"看起来配了其实没配"的静默失效）。
    if (def?.stack_decay !== undefined) {
      const every: unknown = def.stack_decay?.every
      const amount: unknown = def.stack_decay?.amount
      if (typeof every !== 'number' || !Number.isFinite(every) || every <= 0) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `状态 '${id}' 的 stack_decay.every 必须是正有限数（收到 ${String(every)}）`,
          suggestion: 'every 是衰减间隔的分钟数；0/负数/非数字会让层数永不衰减',
        })
      }
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `状态 '${id}' 的 stack_decay.amount 必须是正有限数（收到 ${String(amount)}）`,
          suggestion: 'amount 是每次衰减扣掉的层数；0 等于没有这个字段，负数会让层数反向增长',
        })
      }
    }
    // 计划三加固：on_apply_effects / on_remove_effects 里的 modify_attribute **按意图判**（不看 hook 名）。
    // 该写法经 effect-system 的 modify_attribute（effect-system/index.ts:52）落到**基础值域**
    // （无 settlement → bindingResolver.getRaw + delta 写回裸值 / char.base）：
    //   · 作者想表达「生效期间 +10」→ 变成「永久 +10」，且生效期间任何一次读-改-写（升级/突破的
    //     成长结算）会把临时值按比例烘死（2026-09-22 探针实证：buff 期间一次 ×2 成长把 +10
    //     永久留在身上，raw 30→40）；
    //   · 作者想表达「施加瞬间造成 50 点伤害」→ 那是**有意的永久改变**，写基础值本来就对。
    // 二者在数据上无法自动区分，故**默认 error**（默认安全：绝大多数手写用法是想加个临时 buff），
    // 由作者用 `params.permanent = true` 显式声明"我要的是永久改变"来放行——
    //   `{ type = "modify_attribute", params = { attr = "hp", value = -50, permanent = true } }`
    // 该字段是**作者意图声明**（供加载期校验判读）；运行期路径不变（照旧写基础值）。
    // 属性临时加成一律写 attribute_mods（运行时清单：到期/移除自动消失，基础值分毫不动）。
    // 效果条目的判别字段是 `type`（Effect 形状，见 effect-type-registry.ts:7-14）；
    // battle-effects.toml 的 `action` 是另一份数据（BattleEffectDef），状态钩子不使用它。
    for (const hook of ['on_apply_effects', 'on_remove_effects'] as const) {
      const list: unknown = def?.[hook]
      if (!Array.isArray(list)) continue
      for (const entry of list) {
        const e = entry as { type?: unknown; params?: { permanent?: unknown } } | null | undefined
        if (e?.type !== 'modify_attribute') continue
        if (e.params?.permanent === true) continue // 显式声明的永久意图（伤害/成长）→ 放行
        errorReporter.report({
          source: 'mod-loader', severity: 'error',
          message: `状态 '${id}' 的 ${hook} 用 modify_attribute 改属性会永久污染基础值`,
          suggestion: '生效期间的临时加成改用 attribute_mods（到期/移除自动消失、基础值分毫不动）；'
            + '确实要一次性永久改变属性（伤害/成长，不随状态到期回退）→ 在 params 上写 permanent = true 显式声明意图'
            + '（如 { attr = "hp", value = -50, permanent = true }），或走显式永久写入路径（set_attribute / 脚本 / 任务奖励）',
        })
      }
    }
    // tick_effects **刻意放行**（2026-09-22 查证后的裁定，勿随手改成 error）：
    // ① 路径事实：tick_effects 经 status-system.runEffects → effect-system 的 modify_attribute
    //    （无 settlement → 写基础值），与 on_apply_effects 同一条路径；
    // ② 但 tick 的 value 是**逐次增量**（中毒 −5/60 分钟、振奋 +5/60 分钟）——写基础值正是
    //    "伤害/回复"的本义，不是"临时修正沉淀"；引擎内也没有不写基础值的周期伤害替代路径
    //    （combat-base 的 damage effect-type 同样 bindingResolver.set('hp', …)，见 combat-base/index.ts:351-353）；
    // ③ 现役内容依赖它（h-core 默认 中毒、example-mod 振奋），且既有测试同时钉住"tick 真的生效"
    //    （example-mod-integration.test.ts:278 气血+5）与"启动零 error"（同文件 :58）——
    //    判为 error 会把引擎自带内容判成非法。故规则只覆盖 on_apply/on_remove 两个钩子。
  }
}

