// 注释：h-core 插件——核心入口
// 效果域拆分（E2，2026-08-15）：约 30 个 effect type 注册迁至 effects/ 域模块
// （settle-effects / orgasm-effects / cloth-effects / body-item-effects / gift-effects），
// 本文件 onLoad 只保留 h_state_change 内联注册 + 各域 register 调用（调用点 = 原首个效果
// 注册处，注册顺序与原内联完全一致）。共享 helper（handleOrgasmResults / startHScene /
// endHScene）留在本文件并 export，供 effects/orgasm-effects 导入。

import { conditionEngine } from '../../core/condition-engine'
import type { PluginContext } from '../../core/types'
import { createHState } from './types'
import type { BodyItemSlot } from './types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import type { CommandDef } from '../../core/command-registry'
import { errorReporter } from '../../core/error-reporter'
import { registerHPremises } from './premise/premise-h'
import { registerTargetPremises } from './premise/premise-target'
import { registerFallPremises, getFallLevel } from './premise/premise-fall'
import { registerClothingPremises } from './premise/premise-clothing'
import { registerBodyItemPremises } from './premise/premise-body-item'
import { registerInstructPremises } from './premise/premise-instruct'
import { loadInstructions, validateInstructionData } from '../../core/instruction-loader'
import { calcFavorability, getFavorabilityLevel, getTrustLevel, clearTalentAdjustIndex } from './settle/favorability'
import { calcTrust } from './settle/trust'
import { calcJudge } from './settle/judge'
import { settleOneState } from './settle/state-settle'
import { grantFavoritePositionIfDue } from './settle/position'
import { decayTalkCount } from './settle/talk'
import { getContinuousAdjust } from '../../core/command-executor'
import { getLevel, ATTR } from '../../core/entity-utils'
import { orgasmJudge, insertPositionToBodyCid, releaseOrgasmEdge } from './settle/orgasm'
import { settleEndHHpmpGrowth } from './settle/hpmp-growth'
import { modLoader, revalidateCharacterContract, revalidateItemUses } from '../../core/mod-loader'
import { apiSystem } from '../../core/api'
import { registerNoSaveMode } from '../../core/save-system'
import { registerCharacterValidator } from '../../core/character-contract'
import { useRegistry } from '../../core/use-registry'
import type { SecondSettleResult } from './settle/orgasm'
import { registerSettleEffects } from './effects/settle-effects'
import { registerOrgasmEffects } from './effects/orgasm-effects'
import { registerClothEffects } from './effects/cloth-effects'
import { registerBodyItemEffects } from './effects/body-item-effects'
import { registerGiftEffects } from './effects/gift-effects'

// 注释：game:plugins_loaded 监听器只注册一次（onEnable 重复执行时不重复监听）
let hCorePluginsLoadedListener = false
// 注释：talk_count 衰减监听器只注册一次（同 plugins_loaded 模式）
let hCoreTalkDecayListener = false
// 注释：execution_end 二段结算监听器只注册一次——2026-08-08 eja 重构后此监听器
// 承担射精欲积累 + 绝顶判定，重复注册会双倍结算（plugin-manager 的 loadPlugins 无幂等守卫）
let hCoreExecutionEndListener = false
// 注释：expiry 到期清理监听器只注册一次（同 talk_decay 模式）
let hCoreExpiryListener = false

// 注释：处理二段结算结果——输出绝顶/多重绝顶日志与事件（execution_end 与 h_orgasm_check 共用）
// 2026-08-08 对齐 erArk orgasm_settle_flag 去重（second_behavior.py:168-195）：
// 同一部位多个高潮事件只显示最高程度（日志/口上），数值效果照常；
// h:orgasm 事件逐条保留（h-hidden 发现度 / h-time-stop 累计等数值消费方依赖每条）
// 注：必须逐条 await emit——eventBus 有防重入保护（同事件并发 emit 会被吞），
// 同步连发 3 次只发 1 条（2026-08-08 审查发现并修复）
// 共享 helper（E2 拆分后 effects/orgasm-effects 经 '../index' 导入）
export async function handleOrgasmResults(id: string, ch: any, result: SecondSettleResult): Promise<void> {
  const partMaxDegree = new Map<number, number>()
  for (const ev of result.orgasms) {
    const cur = partMaxDegree.get(ev.partId)
    if (cur === undefined || ev.degree > cur) partMaxDegree.set(ev.partId, ev.degree)
    await eventBus.emit('h:orgasm', { character: id, partId: ev.partId, level: ev.degree, count: ev.count, extra: ev.extra })
    // TODO(counter-system)（ADR-0016）：h:orgasm payload 缺"施动者"——counter-system 按男角色
    // 分条的绝顶统计需要 sourceId（谁让她绝顶）。与指令复刻批次对照后补（h:shoot 已有
    // character/target/position/amount，h:orgasm 对齐加 sourceId）
  }
  for (const [, degree] of partMaxDegree) {
    const degreeName = ['小', '普通', '强', '超强'][degree] ?? '普通'
    narrativeLog.write(`${ch.name || id} ${degreeName}绝顶！`, 'dialogue', 'h-core')
  }
  if (result.pluralCount >= 2) {
    narrativeLog.write(`${ch.name || id} 多重绝顶（${result.pluralCount}部位）！`, 'dialogue', 'h-core')
    await eventBus.emit('h:plural_orgasm', { character: id, count: result.pluralCount })
  }
}

export function onLoad(_ctx: PluginContext): void {
  // 注释：注册 H 物品 use 值（grill Q2/Q8）
  useRegistry.register('h_drug')
  useRegistry.register('h_toy')
  useRegistry.register('h_special')
  // 注释：补跑已加载 mod 的物品 use 校验——main.ts 顺序 = loadMod 先、插件 onLoad 后，
  // mod 层物品用 h_drug/h_toy/h_special 时解析阶段会误报"未注册"；注册后立即补跑。
  // 插件先行的启动顺序无需补跑（parseModData 时 use 已注册，revalidate 幂等无害）
  revalidateItemUses()
  // 注释：角色契约校验器（标准角色契约 spec §10.1——最小必需集）
  registerCharacterContractValidator()
  // 注释：补跑已加载 mod 的角色校验——main.ts 顺序 = loadMod 先、插件 onLoad 后，
  // 首次加载时本校验器未注册（必需集校验永不执行）；注册后立即补跑。
  // 插件先行的启动顺序无需补跑（parseModData 时校验器已注册，revalidate 幂等无害）
  revalidateCharacterContract()
  // 注释：效果域注册（E2 拆分，2026-08-15）——各域模块调用点 = 原首个效果注册处，
  // 注册顺序与原内联注册一致（settle → orgasm → cloth → body_item → gift）
  registerSettleEffects()
  registerOrgasmEffects()
  registerClothEffects()

  effectTypeRegistry.register('h_state_change', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    for (const id of ids) execCtx.settlement.applyChange(id, _p.statusId, _p.value)
    return true
  })

  registerBodyItemEffects()
  registerGiftEffects()
}

// 注释：execution_end 二段结算处理（对齐 erArk check_second_effect）
// 流程：body_item_tick（道具 tick）→ orgasmJudge（高潮判定 + 射精欲积累）→ 玩家射精时调 eja_climax
// 模块级函数 + 只注册一次守卫（plugin-manager 的 loadPlugins 无幂等守卫，重复 onEnable 会双倍结算）
async function handleExecutionEnd(): Promise<void> {
  const mode = gameContext.getCurrentMode()
  if (mode !== 'h_scene') return
  const inH: string[] = []
  for (const ch of entitySystem.getAll('character')) {
    const c = ch as any
    if (c.h_state?.is_h) inH.push(c.id)
  }
  if (inH.length === 0) return
  // 注释：1. 对每个 H 中角色应用 body_item_tick（道具持续效果）
  await apiSystem.call('effect-system', 'execute', [{ type: 'body_item_tick', params: { target: 'self' } }], {
    sourceId: inH[0],
    _targetIds: inH,
  })
  // 注释：2. 自动二段结算——高潮判定（erArk orgasm_judge + orgasm_settle）
  for (const id of inH) {
    const ch = entitySystem.get('character', id) as any
    if (!ch?.h_state) continue
    const result = await orgasmJudge(id)
    await handleOrgasmResults(id, ch, result)
    // 注释：3. 玩家射精触发（erArk orgasm_judge 射精分支）
    // 忍耐判定（概率+手动弹窗延后）和射精量公式都在 eja_climax 内部（h-ejaculation），此处只触发
    if (result.shouldEjaculate && (id === '0' || id === 'player')) {
      if (effectTypeRegistry.has('eja_climax')) {
        await apiSystem.call('effect-system', 'execute', [
          { type: 'eja_climax', params: { positionId: insertPositionToBodyCid(ch.h_state?.insert_position ?? -1) }, target: 'self' },
        ], { sourceId: id, _targetIds: [id] })
      } else {
        // 射精系统未启用（h-ejaculation 插件缺失）——登记 warning 而非静默
        errorReporter.report({
          source: 'h-core',
          severity: 'warning',
          message: `玩家射精欲已满但 eja_climax 未注册（h-ejaculation 插件未启用）`,
          suggestion: '检查 h-ejaculation 插件是否已加载',
        })
      }
    }
  }
  // 注释：4. 喜欢体位懒授予（erArk settle_favorite_sex_position 在公式内懒授予 → 引擎统一
  // 在此点：体位经验 ≥100 且无喜好天赋 → 授予 + 叙事，2026-08-08 grilling 决策）
  for (const id of inH) {
    const ch = entitySystem.get('character', id) as any
    if (ch) grantFavoritePositionIfDue(ch, modLoader.getMod())
  }
}

export function onEnable(ctx: PluginContext): void {
  registerNoSaveMode('h_scene')
  // 注释：天赋修正索引随插件启用重建（mod 切换/测试环境重载时避免脏缓存）
  clearTalentAdjustIndex()
  registerHPremises(conditionEngine)
  registerTargetPremises(conditionEngine)
  registerFallPremises(conditionEngine)
  registerClothingPremises(conditionEngine)
  registerBodyItemPremises(conditionEngine)
  registerInstructPremises(conditionEngine)

  // 注释：每次 H 行动后自动二段结算（对齐 erArk check_second_effect）
  // 流程：body_item_tick（道具 tick）→ orgasmJudge（高潮判定 + 射精欲积累）→ 玩家射精时调 eja_climax
  // 只注册一次（plugin-manager 的 loadPlugins 无幂等守卫，重复 onEnable 会双倍结算）
  if (!hCoreExecutionEndListener) {
    hCoreExecutionEndListener = true
    ctx.events.on('game:execution_end', handleExecutionEnd)
  }

  // 注释：expiry 到期清槽（2026-08-12 复刻 erArk realtime_settle.py:270-283）——
  // 安眠药/事前避孕药等 body_auto_remove=expiry 的物品到点自动清除槽位
  // （不归还背包，药已消耗——grill Q4 定案）。每次游戏小时变化检查。
  if (!hCoreExpiryListener) {
    hCoreExpiryListener = true
    ctx.events.on('game:hour_changed', () => {
      const ct = gameContext.getContext().time
      const nowMin = ct.hour * 60 + ct.minute
      for (const ch of entitySystem.getAll('character')) {
        const c = ch as any
        if (!c?.body_items) continue
        for (const [slotKey, slotData] of Object.entries(c.body_items) as [string, any][]) {
          const sd = slotData as BodyItemSlot
          if (sd.active && typeof sd.expiry === 'number' && sd.expiry <= nowMin) {
            delete c.body_items[slotKey]
            eventBus.emit('character:changed', { id: c.id })
          }
        }
      }
    })
  }

  ctx.api.register('h-core', {
    startHScene, endHScene, getLevel, calcFavorability, calcTrust, calcJudge,
    getFavorabilityLevel, getTrustLevel,
    // 注释：陷落等级查询（0=未陷落；爱情系 1-4；隶属系 -1~-4——erArk get_character_fall_level，
    // attr_calculation.py:891-921）。h-npc-ai 无意识恢复的继续H判定（handle_npc_instruct_condition
    // 三分支）经此 API 取真实陷落等级（跨插件禁止直接 import）
    getFallLevel,
    // 注释：通用状态结算（对外暴露——其他插件（如 h-hidden 隐奸/露出持续快感）经 API 调用，
    // 遵守"插件间禁止直接 import"铁律；参数同 settleOneState）
    // settleState(charId, state, baseValue, timeCost, opts?: {
    //   abilityLevel?, abilityKeyOverride?, isGroupSex?, continuous?, negate?, tenthsAdd?, extraAdjust?,
    //   externalAbilityLevel? })
    settleState: (
      charId: string, state: string, baseValue: number, timeCost: number,
      opts?: { abilityLevel?: number | null; abilityKeyOverride?: string | null; isGroupSex?: boolean; continuous?: number; negate?: boolean; tenthsAdd?: boolean; extraAdjust?: number; externalAbilityLevel?: number | null },
    ) => {
      const ch = entitySystem.get('character', charId) as any
      if (!ch) {
        // 注释：无效目标不静默（调用方 bug——如跨插件传错 id）
        errorReporter.report({
          source: 'h-core',
          severity: 'warning',
          message: `settleState：角色 '${charId}' 不存在，跳过结算`,
          suggestion: '检查调用方传入的 charId 是否正确（跨插件调用经 API 通道）',
        })
        return
      }
      const playerId = gameContext.getContext().player?.id ?? null
      settleOneState(
        { sourceId: playerId, settlement: undefined },
        ch, charId, state, baseValue, timeCost,
        opts?.abilityLevel ?? null,
        opts?.abilityKeyOverride ?? null,
        opts?.isGroupSex ?? false,
        opts?.continuous ?? getContinuousAdjust(),
        opts?.negate ?? false,
        opts?.tenthsAdd ?? true,
        opts?.extraAdjust ?? 0,
        opts?.externalAbilityLevel ?? null,
      )
    },
  })

  loadInstructions()
  // 注释：指令 condition/premises/调整表校验依赖全部插件的字段注册完毕，
  // 监听 plugin-manager 全部 onEnable 后的生命周期事件再校验（防重复注册）
  if (!hCorePluginsLoadedListener) {
    hCorePluginsLoadedListener = true
    eventBus.on('game:plugins_loaded', () => { validateInstructionData() })
  }
  // 注释：talk_count 时间衰减——每次玩家行动开始对当前选中目标衰减（erArk character_behavior.py:413，
  // change_character_talkcount_for_time 挂整个行动循环，不只聊天）
  // gameContext.selectedCharacterId 由 engine-ui-bridge 从 uiStore 同步（round-3 修复的同步链路）
  if (!hCoreTalkDecayListener) {
    hCoreTalkDecayListener = true
    ctx.events.on('game:execution_start', () => {
      const gc = gameContext.getContext()
      // 注释：时停解放标志重置（对齐 erArk handle_npc_ai_in_h.py:99——NPC 每次行动开始时
      // time_stop_release 置回 False）。2026-08-08 审查修复：原 releaseTimeStopOrgasm 置 true 后
      // 永不重置 → 时停解除后 H 内后续所有高潮全走解放路径（roll 压缩/超强，静默偏差）；
      // 重置在行动开始 → 时停解除指令（同一次行动）先执行 release 置 true，execution_end
      // 二段结算正常走解放；下一次行动重置回普通路径（对齐 erArk"一个行为周期"语义）
      for (const ch of entitySystem.getAll('character')) {
        const c = ch as any
        if (c.h_state?.is_h && c.h_state.time_stop_release) {
          c.h_state.time_stop_release = false
        }
      }
      const selected = gc.selectedCharacterId
      if (!selected) return
      const target = entitySystem.get('character', selected) as any
      if (!target) return
      // 注释：execution_start 时时间尚未推进 → now = 行动开始时刻（对齐 erArk behavior.start_time）
      decayTalkCount(target, { day: gc.time.day, hour: gc.time.hour })
    })
  }

  const doHCmd: CommandDef = {
    id: 'do_h', label: '邀请H', group: 'character_commands',
    modes: ['exploration'], priority: 80, timeCost: 10,
    condition: 'premise(HAVE_TARGET) && premise(NOT_H) && premise(T_NORMAL) && premise(SCENE_ONLY_TWO) && premise(TIRED_LE_74)',
    source: 'plugin:h-core',
    handler: async (execCtx: any) => {
      const s = execCtx?.uiStore?.selectedCharacterId
      const p = execCtx?.gameStore?.player?.id
      if (s && p) await startHScene(p, s)
    },
  }
  ctx.commands.register(doHCmd)

  const endHCmd: CommandDef = {
    id: 'end_h', label: '结束H', group: 'character_commands',
    modes: ['h_scene'], priority: 1, source: 'plugin:h-core',
    // 注释：逆推中隐藏（erArk h_end 带 T_NPC_NOT_ACTIVE_H 前提，08-指令集-H内.md:25-42）——
    // 前提由 h-npc-ai 注册真语义；未注册时非严格求值跳过 = 显示（插件未加载的兜底）
    premises: ['T_NPC_NOT_ACTIVE_H'],
    handler: async (execCtx: any) => {
      const p = execCtx?.gameStore?.player?.id
      if (p) await endHScene(p)
    },
  }
  ctx.commands.register(endHCmd)
}

// 共享 helper（E2 拆分后 effects/orgasm-effects 的 h_start_h/h_end_h 经 '../index' 导入）
export async function startHScene(allyId: string, targetId: string): Promise<void> {
  const t = entitySystem.get('character', targetId) as any
  if (!t) return
  t.h_state = createHState()
  t.h_state.target_character_id = allyId
  const a = entitySystem.get('character', allyId) as any
  if (a) {
    a.h_state = createHState()
    a.h_state.target_character_id = targetId
  }
  await gameContext.enterMode('h_scene')
  await eventBus.emit('h:start', { ally: allyId, target: targetId })
  // TODO(counter-system)（ADR-0016）：h:start 只有单对双方；群交/多参与者 H 的参与者列表
  // 缺失——counter-system 的一男多女/一女多男/群交人数计数需扩展 payload（群交整体重写时对照）
  narrativeLog.write('开始 H', 'dialogue', 'h-core')
}

export async function endHScene(allyId: string): Promise<void> {
  // 注释：退出 H 前释放寸止累计（对齐 erArk release_orgasm_edge_now + H_END 调用，
  // orgasm_settle.py:333-355 + default.py:6819）——2026-08-08 修复：原直接清 h_state，
  // 寸止成功累计的绝顶被静默丢弃。释放落在退出重置（清 h_state/统计奖励）之前，
  // 单人退出（自己+目标）与群交退出全员都覆盖（遍历所有 is_h 角色）
  for (const ch of entitySystem.getAll('character')) {
    const c = ch as any
    if (!c.h_state?.is_h) continue
    const released = releaseOrgasmEdge(c.id)
    if (released.orgasms.length > 0) await handleOrgasmResults(c.id, c, released)
  }
  // 注释：H 结束上限成长（erArk 528 END_H_ADD_HPMP_MAX，:6700-6753）——绝顶次数→体力/气力/
  // 精液上限成长 + NPC 能力升级结算。必须在清 h_state 之前执行（orgasm_count 数据源）
  for (const ch of entitySystem.getAll('character')) {
    const c = ch as any
    if (c.h_state?.is_h) {
      await settleEndHHpmpGrowth(c.id)
    }
  }
  for (const ch of entitySystem.getAll('character')) {
    const c = ch as any
    if (c.h_state?.is_h) {
      c.h_state = undefined
      // 注释：H 结束自动穿回 equipment_off → equipment
      if (c.equipment_off) {
        if (!c.equipment) c.equipment = {}
        for (const [slot, item] of Object.entries(c.equipment_off) as [string, any][]) {
          c.equipment[slot] = item
        }
        c.equipment_off = {}
      }
      // 注释：H 结束自动清理 body_auto_remove=h_end 的 body_item（grill Q4：归还背包 +1）
      if (c.body_items) {
        const mod = modLoader.getMod()
        for (const [slotKey, slotData] of Object.entries(c.body_items) as [string, any][]) {
          const sd = slotData as BodyItemSlot
          if (sd.active) {
            const itemDef = (mod?.items as any)?.[sd.itemId] as any
            if (itemDef?.body_auto_remove === 'h_end') {
              delete c.body_items[slotKey]
              if (sd.itemId) {
                await apiSystem.call('inventory', 'addItem', c.id, sd.itemId, 1)
              }
            }
          }
        }
      }
    }
  }
  // Find5/★2 修复（第五/六轮）：模式栈弹至 h_scene 出栈——H 结束中止 H 内嵌套模式
  // （AGENTS §29：执行不嵌套；H 中嵌套 dialogue 等由 endHScene 一并中止）。
  // 语义：弹掉 h_scene 之上全部嵌套 + h_scene 本身；h_scene 之下的模式（如战斗打断 H
  // 的 [exploration, combat, h_scene] → 弹 h_scene 后回战斗）保留。
  // 终止性：getCurrentMode 空栈兜底 'exploration' → while 必终止。
  // 原无条件 pop 会误弹 exploration 栈基；条件单 pop 会漏 H 中嵌套的 dialogue（泄漏）
  while (gameContext.getCurrentMode() !== 'exploration') {
    const mode = gameContext.getCurrentMode()
    await gameContext.exitMode()
    if (mode === 'h_scene') break
  }
  await eventBus.emit('h:end', { ally: allyId })
  // TODO(counter-system)（ADR-0016）：h:end 只有发起者，无参与者列表——群交/被轮/一男多女
  // 一次多加一的计数需要 participants；群交整体重写时扩展
  narrativeLog.write('结束 H', 'dialogue', 'h-core')
}

// ════════════════════════════════════════
// 标准角色契约（spec §10.1）——最小必需集校验器
// 具体字段名在此插件层声明（core 的 character-contract 注册表是纯机制，不认属性名）
// 校验时机：mod-loader 加载角色后（applyAttributeDefaults 已执行 → 缺=定义被删/未定义）
// 缺失 → warning + 建议（不阻止加载）
// 导出供契约一致性测试（必需集 ⊆ attributes.toml 定义，防"校验器引用未定义属性"）
// ════════════════════════════════════════
// 异常级（§5.1）：缺失直接破坏核心玩法链路
export const CONTRACT_REQUIRED_BASE = [ATTR.HP, ATTR.MP, ATTR.HP_MAX, ATTR.MP_MAX, ATTR.FAVORABILITY, ATTR.TRUST, ATTR.DESIRE, ATTR.EJA_GAUGE, ATTR.EJA_GAUGE_MAX, ATTR.SEMEN, ATTR.SEMEN_MAX]
export const CONTRACT_REQUIRED_PARAMS = [ATTR.SKIN, ATTR.BREAST, ATTR.CLITORIS, ATTR.PENIS, ATTR.VAGINA, ATTR.ANUS, ATTR.WOMB, ATTR.THROAT, ATTR.MIND, ATTR.LUBE, ATTR.LEARN, ATTR.DEFERENCE, ATTR.FONDNESS, ATTR.AROUSAL, ATTR.PLEASURE, ATTR.ANTICIPATION, ATTR.OBEDIENCE, ATTR.SHAME, ATTR.PAIN, ATTR.FEAR, ATTR.DEPRESSION, ATTR.RESENTMENT]
export const CONTRACT_REQUIRED_MARKS = [ATTR.MARK_PLEASURE, ATTR.MARK_OBEDIENCE, ATTR.MARK_PAIN, ATTR.MARK_FEAR, ATTR.MARK_REBEL]
export const CONTRACT_REQUIRED_ABILITIES = [ATTR.TECHNIQUE, ATTR.SUBMISSION, ATTR.INTIMACY, ATTR.LUST, ATTR.EXPOSURE, ATTR.SADISM, ATTR.MASOCHISM]

function registerCharacterContractValidator(): void {
  const REQUIRED_BASE = CONTRACT_REQUIRED_BASE
  const REQUIRED_PARAMS = CONTRACT_REQUIRED_PARAMS
  const REQUIRED_MARKS = CONTRACT_REQUIRED_MARKS
  const REQUIRED_ABILITIES = CONTRACT_REQUIRED_ABILITIES

  // attributes.toml category → 实体命名空间（与 applyAttributeDefaults 一致）
  const nsOf = (def: { category?: string }): string => {
    if (!def?.category) return 'base'
    const nsMap: Record<string, string> = { parameter: 'params', mark: 'marks', ability: 'abilities' }
    return nsMap[def.category] ?? def.category
  }

  registerCharacterValidator({
    id: 'h-core',
    validate: (charId, char, mod) => {
      // 按 attributes.toml category 动态解析命名空间（好感度/信赖度 = social → entity.social，
      // 硬编码 base 会误报"缺必需"——2026-08-09 boot-smoke 抓到的真 bug）
      const check = (keys: string[], label: string): void => {
        for (const key of keys) {
          const def = mod.attributes?.[key]
          const ns = nsOf(def)
          const container = (char as any)?.[ns]
          if (!container || container[key] === undefined) {
            errorReporter.report({
              source: 'character-contract:h-core',
              severity: 'warning',
              file: `mods/${mod.id}/definitions/attributes.toml`,
              message: `角色 '${charId}' 缺${label}必需属性 '${key}'（契约 §5.1 异常级，期望命名空间 ${ns}）`,
              suggestion: def
                ? `attributes.toml 已定义 '${key}'（category=${def.category}，默认 ${JSON.stringify(def.default)}）——检查是否被 mod 覆盖删除了；加载时已按默认补齐`
                : `attributes.toml 未定义 '${key}'——契约要求该属性必须存在，请在 h-core 默认或 mod definitions/attributes.toml 中定义`,
            })
          }
        }
      }
      check(REQUIRED_BASE, 'base')
      check(REQUIRED_PARAMS, 'params')
      check(REQUIRED_MARKS, 'marks')
      check(REQUIRED_ABILITIES, 'abilities')
    },
  })
}
