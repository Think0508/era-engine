import { parse as parseTOML } from '@iarna/toml'
import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { gameContext } from '../../core/game-context'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { ATTR } from '../../core/entity-utils'

interface HypnosisData {
  hypnosis_degree: number
  increase_body_sensitivity: boolean
  force_ovulation: boolean
  blockhead: boolean
  active_h: boolean
  pain_as_pleasure: boolean
  roleplay: number[]
}

const DEFAULT_HYPNOSIS: HypnosisData = {
  hypnosis_degree: 0, increase_body_sensitivity: false, force_ovulation: false,
  blockhead: false, active_h: false, pain_as_pleasure: false, roleplay: [],
}

// 2026-08-11 成长系统：删"精神"属性（对账表重对账）——erArk 理智 = 本引擎精力（sanity 绑定，
// sleep-system 提供 15%/h 恢复 + consume_sanity 消耗 effect + 睡眠精力成长）；h-hypnosis 不再自持资源

function getHypnosisXp(charId: string): number {
  const ch = entitySystem.get('character', charId) as any
  return ch?.experience?.hypnosis ?? 0
}

function addHypnosisXp(charId: string, amount: number): void {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return
  if (!ch.experience) ch.experience = {}
  ch.experience.hypnosis = (ch.experience.hypnosis ?? 0) + amount
}

// 玩家催眠天赋检查 — xp 阈值: 1→331, 10→332, 50→333, 200→334
const HYPNOSIS_TALENT_XP = [1, 10, 50, 200]  // 331, 332, 333, 334
const HYPNOSIS_TALENT_IDS = [331, 332, 333, 334]
function hasHypnosisTalent(talentId: number): boolean {
  const playerId = gameContext.getContext().player?.id ?? entitySystem.getAll('character').find((c: any) => c.id === 'player' || c.id === '0')?.id ?? null
  if (!playerId) return false
  const xp = getHypnosisXp(playerId)
  const idx = HYPNOSIS_TALENT_IDS.indexOf(talentId)
  if (idx < 0) return false
  // 注释：检查前置天赋（erArk Hypnosis_Talent_Of_Pl.csv: 332→331, 333→332, 334→333）
  if (idx > 0 && !hasHypnosisTalent(HYPNOSIS_TALENT_IDS[idx - 1])) return false
  return xp >= HYPNOSIS_TALENT_XP[idx]
}

// 注释：获取玩家最高催眠天赋对应的系数（erArk hypnosis_panel.py:64-68）
// 334→6, 333→4, else→2
function getHypnosisCoefficient(): number {
  if (hasHypnosisTalent(334)) return 6
  if (hasHypnosisTalent(333)) return 4
  return 2
}

const HYPNOSIS_TYPE_NAMES = ['无', '平然催眠', '空气催眠', '体控催眠', '心控催眠']

interface RoleplayDef {
  id: number; name: string; type: string; subType: string; info: string
}

// 注释：加载角色扮演数据（插件默认层 roleplay.toml，2026-08-15 从 ROLEPLAY_DATA 常量迁出；
// 数据本体在 data/default/roleplay.toml，结构镜像原对象——[[roleplay]] 数组同键同型）
// 2026-08-10：as:'raw' 已废弃（rolldown 把 TOML 当 JS 解析导致 build 失败）→ import 'default' + eager
const roleplayModules = import.meta.glob(
  '/src/plugins/h-hypnosis/data/default/roleplay.toml',
  { import: 'default', eager: true }
)

// 注释：模块级数据容器——onLoad 填充（插件 onLoad 先于 mod 数据加载与任何运行时消费方；
// 消费方 getRoleplayName 为同步调用，故用 eager glob + 同步解析，无异步时序窗口）
let roleplayData: RoleplayDef[] = []

function loadRoleplayData(): void {
  const raw = Object.values(roleplayModules)[0]
  if (raw == null) {
    errorReporter.report({
      source: 'h-hypnosis',
      severity: 'warning',
      message: 'roleplay.toml 未找到（角色扮演数据未加载，getRoleplayName 回落未知）',
      suggestion: '检查 src/plugins/h-hypnosis/data/default/roleplay.toml 是否存在',
    })
    return
  }
  try {
    const parsed = parseTOML(raw as string) as any
    roleplayData = Array.isArray(parsed.roleplay) ? parsed.roleplay as RoleplayDef[] : []
  } catch (err) {
    // 注释：解析失败上报（2026-08-15——原硬编码常量无失败路径；静默空数组会让
    // getRoleplayName 全部回落 `未知(id)` 且无痕迹）
    errorReporter.report({
      source: 'h-hypnosis',
      severity: 'warning',
      message: `roleplay.toml 解析失败：${err instanceof Error ? err.message : String(err)}（角色扮演数据未加载，getRoleplayName 回落未知）`,
      suggestion: '检查 src/plugins/h-hypnosis/data/default/roleplay.toml 的语法/结构（[[roleplay]] 数组 + id/name/type/subType/info 必填）',
    })
  }
}

function getRoleplayName(id: number): string {
  return roleplayData.find(r => r.id === id)?.name ?? `未知(${id})`
}

void addHypnosisXp

function getSelfId(ctx: any): string | null { return ctx.gameStore?.player?.id ?? ctx.sourceId ?? null }
function getTargetId(ctx: any): string | null { return ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId ?? null }

function getHypnosis(charId: string): HypnosisData {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return { ...DEFAULT_HYPNOSIS }
  if (!ch.hypnosis) ch.hypnosis = { ...DEFAULT_HYPNOSIS }
  return ch.hypnosis
}

function getUnconsciousH(charId: string): number {
  const ch = entitySystem.get('character', charId) as any
  return ch?.sp_flag?.unconscious_h ?? 0
}

function setUnconsciousH(charId: string, val: number): void {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return; if (!ch.sp_flag) ch.sp_flag = {}
  ch.sp_flag.unconscious_h = val
}

let lastHypnosisType = 1

function getAbilityAdjust(lv: number): number {
  const tbl = [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
  return tbl[Math.min(Math.max(0, lv), 10)] ?? 4.0
}

function calculateHypnosisDegree(charId: string): number {
  const target = entitySystem.get('character', charId) as any
  if (!target) return 0
  // 注释：erArk hypnosis_panel.py:64-68 — 基于玩家最高天赋的系数
  const baseCoeff = getHypnosisCoefficient()
  // TODO: 调香加成（aromatherapy == 6 → +5）
  // 注释：erArk hypnosis_panel.py:74-75 — 无觉刻印 ability[19] 系数
  const markLv = target?.abilities?.[ATTR.MARK_VOID]?.level ?? 0
  const abilityAdj = getAbilityAdjust(markLv)
  // 注释：erArk hypnosis_panel.py:77-78 — random(0.5, 1.5)
  const adjust = baseCoeff * abilityAdj
  const rand = 0.5 + Math.random()
  return Math.round(1 * adjust * rand * 10) / 10
}

// TODO: 调香加成（aromatherapy == 6）依赖香薰系统就绪后接入
function calculateSanityCost(charId: string): number {
  const target = entitySystem.get('character', charId) as any
  if (!target) return 20
  // 注释：audit-b I4——原读 target.talent[71/72/73] 数值键（引擎按名存 talents），
  // 恒 0 → 完全催眠目标催眠指令成本不降。改读按名天赋
  if (target.talents?.['已催眠·极']) return 1
  if (target.talents?.['已催眠·深']) return 30
  if (target.talents?.['已催眠·浅']) return 25
  return 20
}

function getHypnosisDegreeLimit(): number {
  const limits = [0, 50, 100, 100, 200]  // 331→50, 332→100, 333→100, 334→200
  for (let i = limits.length - 1; i >= 0; i--) {
    if (hasHypnosisTalent(331 + i)) return limits[i]
  }
  return 0
}

// 注释：NPC 催眠天赋阈值 — 程度 ≥ 50→71, ≥ 100→72, ≥ 200→73
// erArk Hypnosis_Talent_Of_Npc.csv + hypnosis_panel.py:107-158 + handle_talent.py:189-222
// NPC 需要对应玩家天赋: 72→332, 73→334
// 2026-08-12（audit-b I4）：原写 ch.talent[71/72/73] 数值键——引擎按名存 ch.talents
// （talents.toml:280-296 已催眠·浅/深/极）→ 催眠天赋永不落账（judge 修正/口上/完全催眠
// 不可达）。改按名写 ch.talents（值为 1，与引擎天赋存储一致）
const HYPNOSIS_TALENT_BY_DEGREE: { minDegree: number; talentName: string }[] = [
  { minDegree: 200, talentName: '已催眠·极' },
  { minDegree: 100, talentName: '已催眠·深' },
  { minDegree: 50, talentName: '已催眠·浅' },
]
function checkHypnosisCompletion(charId: string): boolean {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return false
  const h = getHypnosis(charId)
  const degree = h.hypnosis_degree
  let changed = false

  for (const tier of HYPNOSIS_TALENT_BY_DEGREE) {
    if (degree < tier.minDegree || ch.talents?.[tier.talentName]) continue
    const playerTalentNeeded = tier.minDegree >= 200 ? 334 : tier.minDegree >= 100 ? 332 : 331
    if (!hasHypnosisTalent(playerTalentNeeded)) continue
    if (!ch.talents) ch.talents = {}
    ch.talents[tier.talentName] = 1
    const msg = tier.minDegree >= 200
      ? `${ch.name ?? charId} 被完全催眠了！`
      : tier.minDegree >= 100
        ? `${ch.name ?? charId} 被深度催眠了！`
        : `${ch.name ?? charId} 被初级催眠了！`
    narrativeLog.write(msg, 'system', 'h-hypnosis')
    // TODO: 触发二段行为 has_been_complete_hypnosis（需 second_behavior 系统）
    // TODO: 触发成就 achievement_flow("催眠")
    changed = true
  }
  // TODO: 空气催眠门锁检查（需要场景 close_type 支持）
  // TODO: 成就触发（需要成就系统）
  return changed
}

function applySensitivityBonus(charId: string, baseAdjust: number): number {
  const h = getHypnosis(charId)
  if (h.increase_body_sensitivity) return baseAdjust + 2
  return baseAdjust
}

function applyPainAsPleasure(charId: string, stateId: number): number {
  const h = getHypnosis(charId)
  if (h.pain_as_pleasure && stateId === 17) return 23
  return stateId
}

function applyAirHypnosisTrustMod(charId: string, trustGain: number): number {
  if (getUnconsciousH(charId) === 5) return 0
  return trustGain
}

function applyHypnosisSexExp(charId: string): void {
  const u = getUnconsciousH(charId)
  if (u >= 4 && u <= 7) {
    const target = entitySystem.get('character', charId) as any
    if (target) {
      // 注释：B9 修复（audit-b I8）——原写 h_exp.hypnosis（错误容器 + 自定义键，
      // 无消费方）；erArk 数字 ID：被催眠姦经验=127（目标），催眠姦经验=126（玩家）
      // （erark-attr-ledger，11-睡眠与无意识H.md §5.2）
      if (!target.experience) target.experience = {}
      target.experience['127'] = (target.experience['127'] ?? 0) + 1
      const playerId = gameContext.getContext().player?.id ?? entitySystem.getAll('character').find((c: any) => c.id === 'player' || c.id === '0')?.id ?? null
      if (playerId && playerId !== charId) {
        const player = entitySystem.get('character', playerId) as any
        if (player) {
          if (!player.experience) player.experience = {}
          player.experience['126'] = (player.experience['126'] ?? 0) + 1
        }
      }
    }
  }
}

function registerBoolEffect(type: string, field: string, value: boolean): void {
  effectTypeRegistry.register(type, (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) (getHypnosis(id) as any)[field] = value
    return true
  })
}

export function onLoad(_ctx: PluginContext): void {
  loadRoleplayData()

  // 注释：audit-k 修复（2026-08-12）——lastHypnosisType 此前恒 1（无任何赋值点），
  // 空气/体控/心控催眠（类型 2/3/4）永远不可达。提供 effect 入口供指令/数据设置类型
  effectTypeRegistry.register('hypnosis_set_type', (_p: any, _execCtx: any) => {
    const t = Math.max(1, Math.min(4, (_p.type as number | undefined) ?? 1))
    lastHypnosisType = t
    return true
  })

  // Core: hypnosis_one — erArk 1211, hypnosis_panel.py:42-158
  effectTypeRegistry.register('hypnosis_one', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    if (ids.length === 0) return true
    const id = ids[0]
    const h = getHypnosis(id)
    const gain = calculateHypnosisDegree(id)
    if (gain <= 0) return true  // 已达上限
    h.hypnosis_degree = Math.min(h.hypnosis_degree + gain, getHypnosisDegreeLimit())
    // 注释：erArk hypnosis_panel.py:144-147 — 设置 unconscious_h = type + 3
    // audit-k：支持 params.type 指定（1 平然/2 空气/3 体控/4 心控），缺省用 lastHypnosisType
    if (h.hypnosis_degree > 0 && (getUnconsciousH(id) < 4 || getUnconsciousH(id) > 7)) {
      const t = (_p.type as number | undefined) ?? lastHypnosisType
      const typeVal = Math.max(1, Math.min(4, t)) + 3  // 1→4(平然), 2→5(空气), 3→6(体控), 4→7(心控)
      setUnconsciousH(id, Math.max(4, Math.min(7, typeVal)))
    }
    checkHypnosisCompletion(id)
    narrativeLog.write(`催眠程度 +${gain}`, 'system', 'h-hypnosis')
    return true
  })

  // Core: hypnosis_all — erArk 1212
  effectTypeRegistry.register('hypnosis_all', (_p: any, _execCtx: any) => {
    const allIds = entitySystem.getAllIds('character')
    for (const id of allIds) {
      const h = getHypnosis(id)
      if (h.hypnosis_degree === 0) {
        const gain = calculateHypnosisDegree(id)
        if (gain <= 0) continue
        h.hypnosis_degree = Math.min(h.hypnosis_degree + gain, getHypnosisDegreeLimit())
        if (h.hypnosis_degree > 0 && (getUnconsciousH(id) < 4 || getUnconsciousH(id) > 7)) {
          const t = (_p.type as number | undefined) ?? lastHypnosisType
          const typeVal = Math.max(1, Math.min(4, t)) + 3
          setUnconsciousH(id, Math.max(4, Math.min(7, typeVal)))
        }
        checkHypnosisCompletion(id)
        narrativeLog.write(`催眠程度 +${gain}`, 'system', 'h-hypnosis')
      }
    }
    return true
  })

  // Core: hypnosis_cancel
  effectTypeRegistry.register('hypnosis_cancel', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      const h = getHypnosis(id)
      h.hypnosis_degree = 0
      h.increase_body_sensitivity = false
      h.force_ovulation = false
      h.blockhead = false
      h.active_h = false
      h.pain_as_pleasure = false
      h.roleplay = []
      setUnconsciousH(id, 0)
    }
    return true
  })

  // Sub-state on/off: increase_body_sensitivity
  registerBoolEffect('hypnosis_increase_body_sensitivity_on', 'increase_body_sensitivity', true)
  registerBoolEffect('hypnosis_increase_body_sensitivity_off', 'increase_body_sensitivity', false)

  // Sub-state on/off: force_ovulation
  registerBoolEffect('hypnosis_force_ovulation_on', 'force_ovulation', true)
  registerBoolEffect('hypnosis_force_ovulation_off', 'force_ovulation', false)

  // Sub-state on/off: blockhead
  registerBoolEffect('hypnosis_blockhead_on', 'blockhead', true)
  registerBoolEffect('hypnosis_blockhead_off', 'blockhead', false)

  // Sub-state on/off: active_h
  registerBoolEffect('hypnosis_active_h_on', 'active_h', true)
  registerBoolEffect('hypnosis_active_h_off', 'active_h', false)

  // Sub-state on/off: pain_as_pleasure
  registerBoolEffect('hypnosis_pain_as_pleasure_on', 'pain_as_pleasure', true)
  registerBoolEffect('hypnosis_pain_as_pleasure_off', 'pain_as_pleasure', false)

  // Switch: blockhead
  effectTypeRegistry.register('hypnosis_blockhead_switch', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      getHypnosis(id).blockhead = !getHypnosis(id).blockhead
    }
    return true
  })

  // Switch: active_h (toggle + trigger H when turning on)
  effectTypeRegistry.register('hypnosis_active_h_switch', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      const h = getHypnosis(id)
      h.active_h = !h.active_h
      if (h.active_h) {
        narrativeLog.write(`逆推触发: ${id}`, 'system', 'h-hypnosis')
      }
    }
    return true
  })

  // Switch: pain_as_pleasure
  effectTypeRegistry.register('hypnosis_pain_as_pleasure_switch', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      getHypnosis(id).pain_as_pleasure = !getHypnosis(id).pain_as_pleasure
    }
    return true
  })

  // Force climax
  effectTypeRegistry.register('hypnosis_force_climax', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      narrativeLog.write(`强制绝顶: ${id}`, 'system', 'h-hypnosis')
    }
    return true
  })

  // set_roleplay — 设置角色扮演（第二阶段）
  effectTypeRegistry.register('set_roleplay', (params: any, execCtx: any) => {
    const ids = params.roleplayIds as number[] ?? []
    for (const id of execCtx._targetIds as string[]) {
      getHypnosis(id).roleplay = ids
    }
    return true
  })
}
export async function onEnable(ctx: PluginContext): Promise<void> {
  let premiseRegWarned = false
  const reg = async (id: string, fn: (c: any) => boolean) => {
    try { await ctx.api.call('engine', 'premises.register', id, fn) } catch (err) {
      if (!premiseRegWarned) {
        premiseRegWarned = true
        errorReporter.report({
          source: 'h-hypnosis',
          severity: 'warning',
          message: "前提注册失败（h-core 未就绪？）：" + (err instanceof Error ? err.message : String(err)),
          suggestion: 'h-core plugin may not be loaded (registerPremise API) - this plugin premises will be unavailable',
        })
      }
    }
  }

  reg('PRIMARY_HYPNOSIS', () => hasHypnosisTalent(331))
  reg('INTERMEDIATE_HYPNOSIS', () => hasHypnosisTalent(332))
  reg('ADVANCED_HYPNOSIS', () => hasHypnosisTalent(333))
  reg('SPECIAL_HYPNOSIS', () => hasHypnosisTalent(334))

  // 2026-08-11：删 game:new_day 精神复位（自研行为，erArk 无此机制——理智不每日复位，
  // 只靠睡眠 15%/h 恢复 + consume_sanity 消耗；h-hypnosis 不管理精力）

  reg('SELF_HYPNOSIS_0', (ctx2: any) => { const id = getSelfId(ctx2); return id ? getHypnosis(id).hypnosis_degree === 0 : false })
  reg('T_HYPNOSIS_0', (ctx2: any) => { const id = getTargetId(ctx2); return id ? getHypnosis(id).hypnosis_degree === 0 : false })
  reg('SELF_HYPNOSIS_NE_0', (ctx2: any) => { const id = getSelfId(ctx2); return id ? getHypnosis(id).hypnosis_degree !== 0 : false })
  reg('T_HYPNOSIS_NE_0', (ctx2: any) => { const id = getTargetId(ctx2); return id ? getHypnosis(id).hypnosis_degree !== 0 : false })

  reg('IN_HYPNOSIS', (ctx2: any) => { const id = getSelfId(ctx2); if (!id) return false; const u = getUnconsciousH(id); return u >= 4 && u <= 7 })
  reg('NOT_IN_HYPNOSIS', (ctx2: any) => { const id = getSelfId(ctx2); if (!id) return false; const u = getUnconsciousH(id); return u < 4 || u > 7 })
  reg('T_IN_HYPNOSIS', (ctx2: any) => { const id = getTargetId(ctx2); if (!id) return false; const u = getUnconsciousH(id); return u >= 4 && u <= 7 })
  reg('T_NOT_IN_HYPNOSIS', (ctx2: any) => { const id = getTargetId(ctx2); if (!id) return false; const u = getUnconsciousH(id); return u < 4 || u > 7 })

  function regSubState(name: string, getter: (h: HypnosisData) => boolean) {
    reg(`HYPNOSIS_${name}`, (ctx2: any) => { const id = getSelfId(ctx2); return id ? getter(getHypnosis(id)) : false })
    reg(`NOT_HYPNOSIS_${name}`, (ctx2: any) => { const id = getSelfId(ctx2); return id ? !getter(getHypnosis(id)) : false })
    reg(`T_HYPNOSIS_${name}`, (ctx2: any) => { const id = getTargetId(ctx2); return id ? getter(getHypnosis(id)) : false })
    reg(`T_NOT_HYPNOSIS_${name}`, (ctx2: any) => { const id = getTargetId(ctx2); return id ? !getter(getHypnosis(id)) : false })
  }
  regSubState('INCREASE_BODY_SENSITIVITY', h => h.increase_body_sensitivity)
  regSubState('FORCE_OVULATION', h => h.force_ovulation)
  regSubState('BLOCKHEAD', h => h.blockhead)
  regSubState('ACTIVE_H', h => h.active_h)
  regSubState('PAIN_AS_PLEASURE', h => h.pain_as_pleasure)
  // 特定角色扮演 ID 前提 — erArk: t_hypnosis_roleplay_1~6
  reg('T_HYPNOSIS_ROLEPLAY_1', (ctx2: any) => { const id = getTargetId(ctx2); return id ? getHypnosis(id).roleplay.includes(1) : false })
  reg('T_HYPNOSIS_ROLEPLAY_2', (ctx2: any) => { const id = getTargetId(ctx2); return id ? getHypnosis(id).roleplay.includes(2) : false })
  reg('T_HYPNOSIS_ROLEPLAY_3', (ctx2: any) => { const id = getTargetId(ctx2); return id ? getHypnosis(id).roleplay.includes(3) : false })
  reg('T_HYPNOSIS_ROLEPLAY_4', (ctx2: any) => { const id = getTargetId(ctx2); return id ? getHypnosis(id).roleplay.includes(4) : false })
  reg('T_HYPNOSIS_ROLEPLAY_5', (ctx2: any) => { const id = getTargetId(ctx2); return id ? getHypnosis(id).roleplay.includes(5) : false })
  reg('T_HYPNOSIS_ROLEPLAY_6', (ctx2: any) => { const id = getTargetId(ctx2); return id ? getHypnosis(id).roleplay.includes(6) : false })
  regSubState('ROLEPLAY', h => h.roleplay.length > 0)

  // 注册公共 API
  ctx.api.register('h-hypnosis', {
    getDegree: (charId: string) => getHypnosis(charId).hypnosis_degree,
    getType: () => lastHypnosisType,
    isHypnotized: (charId: string) => { const u = getUnconsciousH(charId); return u >= 4 && u <= 7 },
    getTypeName: (charId: string) => HYPNOSIS_TYPE_NAMES[getUnconsciousH(charId) >= 4 && getUnconsciousH(charId) <= 7 ? getUnconsciousH(charId) - 3 : 0] ?? '无',
  })

  // 注册 UI 插槽 — 催眠状态标签
  try {
    ctx.ui.registerSlot('character-tag', {
      id: 'hypnosis-tag',
      component: 'HypnosisTag' as any,
      priority: 40,
      condition: (gc: any) => gc?.selectedCharacterId ? (getUnconsciousH(gc.selectedCharacterId) >= 4 && getUnconsciousH(gc.selectedCharacterId) <= 7) : false,
    })
  } catch { /* UI 未就绪 */ }

  // 注释：读档后重置上次催眠类型（2026-08-14 存档复刻）——瞬态 UI/指令默认值
  ctx.events.on('game:load', () => {
    lastHypnosisType = 1
  })
}

export type { HypnosisData }
export {
  DEFAULT_HYPNOSIS, HYPNOSIS_TYPE_NAMES, roleplayData as ROLEPLAY_DATA, getRoleplayName, getSelfId, getTargetId, getHypnosis, getUnconsciousH, setUnconsciousH,
  getAbilityAdjust, calculateHypnosisDegree, calculateSanityCost, getHypnosisDegreeLimit, checkHypnosisCompletion,
  applySensitivityBonus, applyPainAsPleasure, applyAirHypnosisTrustMod, applyHypnosisSexExp,
}
