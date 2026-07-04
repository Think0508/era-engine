import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { narrativeLog } from '../../core/narrative-log'
import { eventBus } from '../../core/event-bus'

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

// 精神力 — 消耗资源，参考 h-time-stop TSP 模式
const HYPNOSIS_SANITY_MAX = 100

function getSanity(charId: string): number {
  const ch = entitySystem.get('character', charId) as any
  return ch?.base?.['精神'] ?? HYPNOSIS_SANITY_MAX
}

function setSanity(charId: string, val: number): void {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return
  if (!ch.base) ch.base = {}
  ch.base['精神'] = Math.max(0, Math.min(HYPNOSIS_SANITY_MAX, val))
}

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
  const playerId = entitySystem.getAll('character').find((c: any) => c.id === 'player' || c.id === '0')?.id
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

const ROLEPLAY_DATA: RoleplayDef[] = [
  { id: 0,  name: '无',        type: '无',   subType: '无',   info: '不进行角色扮演。' },
  { id: 1,  name: '妻子',      type: '家庭', subType: '无',   info: '对方是自己的妻子，和自己感情十分深厚。' },
  { id: 2,  name: '姐姐',      type: '家庭', subType: '无',   info: '对方是自己的亲姐姐，对自己这个弟弟十分照顾。' },
  { id: 3,  name: '妹妹',      type: '家庭', subType: '无',   info: '对方是自己的亲妹妹，很依赖自己这个哥哥。' },
  { id: 4,  name: '女儿',      type: '家庭', subType: '无',   info: '对方是自己的亲生女儿，天真可爱，非常依赖自己。' },
  { id: 5,  name: '妈妈',      type: '家庭', subType: '无',   info: '对方是自己的妈妈，对自己有强烈的保护欲和溺爱。' },
  { id: 11, name: '小学生',    type: '职业', subType: '校园', info: '对方是正在上小学的学生，天真无邪，充满好奇心。' },
  { id: 12, name: '初中生',    type: '职业', subType: '校园', info: '对方是正在上初中的学生，正值叛逆期。' },
  { id: 13, name: '高中生',    type: '职业', subType: '校园', info: '对方是正在上高中的学生，青春活泼。' },
  { id: 14, name: '大学生',    type: '职业', subType: '校园', info: '对方是正在上大学的学生，追求梦想。' },
  { id: 15, name: '教师',      type: '职业', subType: '校园', info: '对方是学校的教师，关心学生的成长与学习。' },
  { id: 21, name: '护士',      type: '职业', subType: '护士', info: '对方是照顾病人的护士，温柔体贴。' },
  { id: 22, name: '警察',      type: '职业', subType: '无',   info: '对方是维护社会秩序的警察。' },
  { id: 23, name: '白领',      type: '职业', subType: '无',   info: '对方是公司职员，工作繁忙压力大。' },
  { id: 24, name: '偶像',      type: '职业', subType: '偶像', info: '对方是国民级的美少女偶像。' },
  { id: 25, name: '家庭女仆',  type: '职业', subType: '家庭女仆', info: '对方是自己家雇佣的女仆。' },
  { id: 26, name: '咖啡厅女仆',type: '职业', subType: '咖啡厅女仆', info: '对方是在女仆咖啡厅工作的女仆。' },
  { id: 27, name: '巫女',      type: '职业', subType: '巫女', info: '对方是神社的巫女。' },
  { id: 31, name: '陌生人',    type: '关系', subType: '非家庭', info: '自己和对方之间没有任何关系。' },
  { id: 32, name: '师生',      type: '关系', subType: '校园', info: '对方和自己是教导的师生关系。' },
  { id: 33, name: '同学',      type: '关系', subType: '校园', info: '对方是自己的同班同学。' },
  { id: 34, name: '同事',      type: '关系', subType: '非家庭', info: '对方是自己的同事，工作上互相支持。' },
  { id: 35, name: '邻居',      type: '关系', subType: '非家庭', info: '对方是住在自己隔壁的邻居。' },
  { id: 51, name: '宠物猫',    type: '人外', subType: '特殊', info: '对方以为自己是一只猫，拥有猫的所有特征和习性。' },
  { id: 52, name: '宠物狗',    type: '人外', subType: '特殊', info: '对方以为自己是一只狗，拥有狗的所有特征和习性。' },
  { id: 53, name: '魅魔',      type: '人外', subType: '无',   info: '对方以为自己是魅魔，以吸取精气为生。' },
  { id: 101,name: '电车痴汉',  type: '场景', subType: '通用', info: '在拥挤的电车上进行痴汉行为。' },
  { id: 102,name: '户外当众',  type: '场景', subType: '通用', info: '在公共场所进行亲密行为。' },
  { id: 103,name: '公共厕所（主动）', type: '场景', subType: '通用', info: '对方把自己捆在公共厕所隔间里。' },
  { id: 104,name: '公共厕所（被动）', type: '场景', subType: '通用', info: '对方被自己捆在公共厕所隔间里。' },
  { id: 105,name: '俘虏拷问',  type: '场景', subType: '特殊', info: '对方是被俘虏的敌人，自己是审讯官。' },
  { id: 106,name: '榨精护士',  type: '场景', subType: '护士', info: '对方是医院的护士，负责精液采集。' },
  { id: 107,name: '战败魔法少女', type: '场景', subType: '特殊', info: '对方是魔法少女，被自己打败后沦为自己的玩物。' },
  { id: 108,name: 'VTuber直播中', type: '场景', subType: '家庭', info: '对方是正在直播的VTuber。' },
  { id: 109,name: '向神灵祭祀', type: '场景', subType: '巫女', info: '在神像面前进行交合。' },
  { id: 110,name: '向自己祭祀', type: '场景', subType: '巫女', info: '对方是巫女，自己化身神灵。' },
  { id: 111,name: '女仆惩罚调教', type: '场景', subType: '家庭女仆', info: '对方做了错事，必须接受主人的惩罚。' },
  { id: 112,name: '女仆咖啡厅里菜单', type: '场景', subType: '咖啡厅女仆', info: '点了特殊的菜单，女仆必须满足要求。' },
  { id: 121,name: '偶像台前准备室', type: '场景', subType: '偶像', info: '在准备室里对偶像进行特殊的准备。' },
  { id: 122,name: '偶像单人LIVE', type: '场景', subType: '偶像', info: '对方为自己开了一场私人演出。' },
  { id: 123,name: '偶像演出后粉丝答谢', type: '场景', subType: '偶像', info: '演出结束后进行特殊的粉丝答谢。' },
  { id: 124,name: '偶像枕营业', type: '场景', subType: '特殊', info: '为了上台表演必须与自己发生关系。' },
  { id: 131,name: '放学后教室H', type: '场景', subType: '校园', info: '在空无一人的教室里偷偷进行性行为。' },
  { id: 132,name: '体育仓库H',  type: '场景', subType: '校园', info: '在体育器材仓库中偷偷进行性行为。' },
  { id: 133,name: '天台H',     type: '场景', subType: '校园', info: '在学校的天台上进行性行为。' },
  { id: 134,name: '学校厕所H', type: '场景', subType: '校园', info: '在学校的厕所里进行性行为。' },
  { id: 135,name: '保健室H',   type: '场景', subType: '校园', info: '藏在保健室的同一张床上进行性行为。' },
]

function getRoleplayName(id: number): string {
  return ROLEPLAY_DATA.find(r => r.id === id)?.name ?? `未知(${id})`
}

void getSanity
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
  const markLv = target?.abilities?.['无觉刻印']?.level ?? 0
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
  if (!target.talent) target.talent = {}
  if (target.talent[73]) return 1
  if (target.talent[72]) return 30
  if (target.talent[71]) return 25
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
function checkHypnosisCompletion(charId: string): boolean {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return false
  const h = getHypnosis(charId)
  const degree = h.hypnosis_degree
  if (!ch.talent) ch.talent = {}
  const talent = ch.talent
  let changed = false

  // 注释：erArk 73 需要玩家有 334, 程度 ≥ 200
  if (degree >= 200 && !talent[73] && hasHypnosisTalent(334)) {
    talent[73] = true
    narrativeLog.write(`${ch.name ?? charId} 被完全催眠了！`, 'system', 'h-hypnosis')
    // TODO: 触发二段行为 has_been_complete_hypnosis（需 second_behavior 系统）
    // TODO: 触发成就 achievement_flow("催眠")
    changed = true
  }
  // 注释：erArk 72 需要玩家有 332, 程度 ≥ 100
  if (degree >= 100 && !talent[72] && hasHypnosisTalent(332)) {
    talent[72] = true
    narrativeLog.write(`${ch.name ?? charId} 被深度催眠了！`, 'system', 'h-hypnosis')
    // TODO: 触发二段行为 has_been_deep_hypnosis
    changed = true
  }
  // 注释：erArk 71 需要玩家有 331, 程度 ≥ 50
  if (degree >= 50 && !talent[71] && hasHypnosisTalent(331)) {
    talent[71] = true
    narrativeLog.write(`${ch.name ?? charId} 被初级催眠了！`, 'system', 'h-hypnosis')
    // TODO: 触发二段行为 has_been_primary_hypnosis
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
      if (!target.h_exp) target.h_exp = {}
      target.h_exp.hypnosis = (target.h_exp.hypnosis ?? 0) + 1
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
  void lastHypnosisType

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
    if (h.hypnosis_degree > 0 && (getUnconsciousH(id) < 4 || getUnconsciousH(id) > 7)) {
      const typeVal = lastHypnosisType + 3  // 1→4(平然), 2→5(空气), 3→6(体控), 4→7(心控)
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
          const typeVal = lastHypnosisType + 3
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
  const reg = (id: string, fn: (c: any) => boolean) => {
    try { ctx.api.call('h-core', 'registerPremise', id, fn) } catch { }
  }

  reg('PRIMARY_HYPNOSIS', () => hasHypnosisTalent(331))
  reg('INTERMEDIATE_HYPNOSIS', () => hasHypnosisTalent(332))
  reg('ADVANCED_HYPNOSIS', () => hasHypnosisTalent(333))
  reg('SPECIAL_HYPNOSIS', () => hasHypnosisTalent(334))

  eventBus.on('game:new_day', () => {
    for (const ch of entitySystem.getAll('character')) {
      setSanity(ch.id, HYPNOSIS_SANITY_MAX)
    }
  })

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
}

export type { HypnosisData }
export {
  DEFAULT_HYPNOSIS, HYPNOSIS_TYPE_NAMES, ROLEPLAY_DATA, getRoleplayName, getSelfId, getTargetId, getHypnosis, getUnconsciousH, setUnconsciousH,
  getAbilityAdjust, calculateHypnosisDegree, calculateSanityCost, getHypnosisDegreeLimit, checkHypnosisCompletion,
  applySensitivityBonus, applyPainAsPleasure, applyAirHypnosisTrustMod, applyHypnosisSexExp,
}
