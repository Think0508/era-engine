// 注释：群交 AI（复刻 erArk handle_npc_ai_in_h.py:556-711 + 13-群交系统.md）
//   type 0 什么都不做 / type 1 自慰 / type 2 自动补位（空槽随机补，满了自慰）/
//   type 3 随机竞争（模板执行时抢空槽 + 50% 替换已占槽）
// 模板数据在 h-group-sex（getTemplate 返回可变引用，await 后改槽位）——经 API 通道，无直接 import
// 槽位行为标识 = 指令 id（string，grill Q10 定案——取代 erArk 数字 behaviorId）
//
// 注意（2026-08-11）：群交玩法将由用户后续大改，本模块只做机制与简短叙事，
// 文本从简，不复刻 erArk 群交面板的全部细节（模板编辑器/邀请流程后置）

import { entitySystem } from '../../core/entity-system'
import { apiSystem } from '../../core/api'
import { eventBus } from '../../core/event-bus'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { getPlayerId, ensureHBlock, isInH, nowMinutes } from './state'
import { filterInstructions, SLOT_TO_TAG } from './filter'

// 注释：群交模板（h-group-sex 结构的最小形状——不 import，只按形状访问）
interface GsSlot {
  targetId: string | null
  behaviorId: string | null
}
interface GsSingleSlots {
  mouth: GsSlot; L_hand: GsSlot; R_hand: GsSlot; penis: GsSlot; anal: GsSlot
}
interface GsHalfTemplate extends GsSingleSlots {
  worship: { targetIds: string[]; behaviorId: string | null }
}
interface GsTemplate {
  A: GsHalfTemplate
  B: GsHalfTemplate
  lock: boolean
  dualRun: boolean
  npcAiType: number
  _lastUsedB?: boolean
}

const SINGLE_SLOTS: (keyof GsSingleSlots)[] = ['mouth', 'L_hand', 'R_hand', 'penis', 'anal']

// 注释：模板获取失败去重上报（每时间片全 NPC 调用——失败不刷屏）
let templateErrorReported = false

async function getTemplate(playerId: string): Promise<GsTemplate | null> {
  try {
    if (!apiSystem.has('h-group-sex', 'getTemplate')) {
      if (!templateErrorReported) {
        templateErrorReported = true
        errorReporter.report({
          source: 'h-npc-ai',
          severity: 'warning',
          message: '群交模板不可用：h-group-sex 的 getTemplate API 未注册',
          suggestion: '检查 h-group-sex 插件是否加载（plugin.toml data_dependencies 应保证依赖）',
        })
      }
      return null
    }
    templateErrorReported = false
    return (await apiSystem.call('h-group-sex', 'getTemplate', playerId)) as GsTemplate
  } catch (err) {
    if (!templateErrorReported) {
      templateErrorReported = true
      errorReporter.report({
        source: 'h-npc-ai',
        severity: 'warning',
        message: `群交模板获取失败：${err instanceof Error ? err.message : String(err)}`,
      })
    }
    return null
  }
}

// 注释：NPC 是否已在模板中（erArk count_group_sex_character_list 语义）
function isInTemplate(tmpl: GsTemplate, npcId: string): boolean {
  for (const t of [tmpl.A, tmpl.B]) {
    for (const name of SINGLE_SLOTS) {
      if (t[name].targetId === npcId) return true
    }
    if (t.worship.targetIds.includes(npcId)) return true
  }
  return false
}

// 注释：当前使用模板（A/B 轮换跟随 _lastUsedB——与 h-group-sex executeGroupSexTemplate 一致）
function activeTemplate(tmpl: GsTemplate): GsHalfTemplate {
  return tmpl._lastUsedB ? tmpl.B : tmpl.A
}

// 注释：空槽位列表（5 单槽 + worship 未满 4 时也视作可加）
function emptySlots(tpl: GsHalfTemplate): string[] {
  const result: string[] = []
  for (const name of SINGLE_SLOTS) {
    if (tpl[name].targetId === null) result.push(name)
  }
  if (tpl.worship.targetIds.length < 4) result.push('worship')
  return result
}

// 注释：按槽位选一条可用指令（erArk get_status_id_list_from_group_sex_body_part 等价）
function pickBehaviorForSlot(slotName: string, npcId: string): string | null {
  const tag = SLOT_TO_TAG[slotName]
  if (!tag) return null
  const candidates = filterInstructions([tag], npcId)
  if (candidates.length === 0) return null
  return candidates[Math.floor(Math.random() * candidates.length)].id
}

// 注释：分配 NPC 到槽位（写入模板引用 + 叙事）
function assignSlot(tpl: GsHalfTemplate, slotName: string, npcId: string, npcName: string): boolean {
  const cmdId = pickBehaviorForSlot(slotName, npcId)
  if (!cmdId) return false
  if (slotName === 'worship') {
    tpl.worship.targetIds.push(npcId)
    if (!tpl.worship.behaviorId) tpl.worship.behaviorId = cmdId
  } else {
    const slot = tpl[slotName as keyof GsSingleSlots]
    slot.targetId = npcId
    slot.behaviorId = cmdId
  }
  narrativeLog.write(`${npcName} 加入了群交。`, 'system', 'h-npc-ai')
  return true
}

// 注释：自慰（erArk SHARE_BLANKLY + masturebate=3）——行为块 h_masturebate + 叙事
// 叙事只在状态切换时输出（行为块已是 h_masturebate 则静默——否则每时间片刷屏）
function masturbate(npc: any): void {
  ensureHBlock(npc)
  if (npc.ai_behavior?.type !== 'h_masturebate') {
    npc.ai_behavior = { id: 'h_masturebate', type: 'h_masturebate', start_time: nowMinutes(), duration: 12 * 60 }
    npc.state = 'h_masturebate'
    npc.current_behavior = 'h_masturebate'
    eventBus.emit('character:changed', { id: npc.id })
    narrativeLog.write(`${npc.name ?? npc.id} 在一旁自慰起来。`, 'system', 'h-npc-ai')
  }
}

// 注释：群交 AI 主入口（time_advanced 每时间片触发，erArk :128-135）
// type 1/2 在此处理；type 0 不动；type 3 由模板执行事件触发（见 onTemplateExecute）
export async function runGroupSexAi(npcId: string): Promise<void> {
  const playerId = getPlayerId()
  if (!playerId) return
  const npc = entitySystem.get('character', npcId) as any
  if (!npc || !isInH(npc)) return
  // 注释：时停 NPC 不参与群交 AI（时停 = 冻结；per-tick 调用点已有跳过，此处防御）
  if (npc.sp_flag?.unconscious_h === 3) return
  const tmpl = await getTemplate(playerId)
  if (!tmpl) return
  if (isInTemplate(tmpl, npcId)) return
  const type = tmpl.npcAiType
  if (type === 0) return

  // 注释：被绳子捆绑不参与群交 AI（erArk handle_self_now_bondage）
  if (npc.h_state?.bondage_type && npc.h_state.bondage_type > 0) return

  if (type === 1) {
    masturbate(npc)
    return
  }
  if (type === 2) {
    const tpl = activeTemplate(tmpl)
    const slots = emptySlots(tpl)
    if (slots.length > 0) {
      const slot = slots[Math.floor(Math.random() * slots.length)]
      if (assignSlot(tpl, slot, npcId, npc.name ?? npcId)) return
    }
    masturbate(npc)
  }
}

// 注释：type 3 抢占 AI（erArk npc_ai_in_group_sex_type_3，模板执行时触发）
// 补空槽（随机选角色）→ 50% 替换已占槽（worship 追加+踢首位）→ 剩余自慰
// useTemplateB：本次执行的目标模板（事件 payload 传入——不用 _lastUsedB 推断，
// 防止调用方显式指定模板时抢占落空）
export async function onTemplateExecute(charId: string, useTemplateB = false): Promise<void> {
  const playerId = getPlayerId()
  if (!playerId) return
  const tmpl = await getTemplate(playerId)
  if (!tmpl || tmpl.npcAiType !== 3) return
  const tpl = useTemplateB ? tmpl.B : tmpl.A

  // 筛选场景内可加入的 NPC（is_h + 群交 + 不在模板 + 非时停）
  const sceneNpcs = entitySystem.getAll('character').filter((c: any) => {
    if (!c?.id || c.id === playerId || c.id === charId) return false
    if (!isInH(c)) return false
    if (isInTemplate(tmpl, c.id)) return false
    // 注释：时停 NPC 不参与抢占（时停 = 冻结）
    if (c.sp_flag?.unconscious_h === 3) return false
    return true
  })
  const pool = [...sceneNpcs]

  // 1. 补空槽（erArk :657-682）
  for (const slot of emptySlots(tpl)) {
    if (pool.length === 0) break
    const idx = Math.floor(Math.random() * pool.length)
    const npc = pool.splice(idx, 1)[0]
    assignSlot(tpl, slot, npc.id, npc.name ?? npc.id)
  }

  // 2. 50% 概率替换已占槽（erArk :684-702）
  const occupied: string[] = []
  for (const name of SINGLE_SLOTS) {
    if (tpl[name].targetId !== null) occupied.push(name)
  }
  if (tpl.worship.targetIds.length > 0) occupied.push('worship')
  for (const name of occupied) {
    if (pool.length === 0) break
    if (Math.random() < 0.5) continue
    const idx = Math.floor(Math.random() * pool.length)
    const npc = pool.splice(idx, 1)[0]
    const npcName = npc.name ?? npc.id
    if (name === 'worship') {
      tpl.worship.targetIds.push(npc.id)
      tpl.worship.targetIds.shift()
    } else {
      // 注释：无可用指令 → 不替换（防止 behaviorId=null 的半空槽——模板执行会静默跳过）
      const cmdId = pickBehaviorForSlot(name, npc.id)
      if (!cmdId) continue
      const slot = tpl[name as keyof GsSingleSlots]
      slot.targetId = npc.id
      slot.behaviorId = cmdId
    }
    narrativeLog.write(`${npcName} 挤了进来，抢占了位置。`, 'system', 'h-npc-ai')
  }

  // 3. 剩余角色自慰（erArk :704-710）
  for (const npc of pool) {
    masturbate(npc)
  }
}
