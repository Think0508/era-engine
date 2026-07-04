// 注释：h-group-sex 插件——群交系统，完全对齐 erArk
// 全局模式开关 + 5 槽位身体部位模板（口/左手/右手/阴茎/肛）+ 阴茎侍奉（最多4 NPC）
// 16 前提 + 10 效果 + HPMP 消耗减少 + 观众加成 + 结束结算

import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { narrativeLog } from '../../core/narrative-log'
import { apiSystem } from '../../core/api'

// 注释：群交模板——5 个单目标槽位 + 1 个多目标侍奉槽
interface GroupSexSlot {
  targetId: string | null
  behaviorId: number | null
}

interface GroupSexTemplate {
  mouth: GroupSexSlot
  L_hand: GroupSexSlot
  R_hand: GroupSexSlot
  penis: GroupSexSlot
  anal: GroupSexSlot
  worship: { targetIds: string[]; behaviorId: number | null }
}

// 注释：全局模式
let groupSexMode = false

// 注释：NPC AI 类型名称
const NPC_AI_NAMES = ['什么都不做', '自慰', '自动补位', '随机竞争']

function getSelfId(ctx: any): string | null {
  return ctx.gameStore?.player?.id ?? ctx.sourceId ?? null
}

function getTargetId(ctx: any): string | null {
  return ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId ?? null
}

// 注释：保留引用，供后续任务使用
void getTargetId
void executeGroupSexTemplate
void applyGroupSexCostReduction
void applyGroupSexAudienceBonus
void applyGroupSexRealtimeTick

// 注释：获取角色的群交模板（返回默认空模板）
function getOrCreateTemplate(charId: string): { A: GroupSexTemplate; B: GroupSexTemplate; lock: boolean; dualRun: boolean; npcAiType: number; _lastUsedB?: boolean } {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return defaultTemplate()
  if (!ch.h_state) ch.h_state = {}
  if (!ch.h_state.group_sex_body_template) {
    ch.h_state.group_sex_body_template = defaultTemplate()
  }
  return ch.h_state.group_sex_body_template
}

function defaultTemplate() {
  const emptySlot = (): GroupSexSlot => ({ targetId: null, behaviorId: null })
  return {
    A: { mouth: emptySlot(), L_hand: emptySlot(), R_hand: emptySlot(), penis: emptySlot(), anal: emptySlot(), worship: { targetIds: [], behaviorId: null } },
    B: { mouth: emptySlot(), L_hand: emptySlot(), R_hand: emptySlot(), penis: emptySlot(), anal: emptySlot(), worship: { targetIds: [], behaviorId: null } },
    lock: false,
    dualRun: false,
    npcAiType: 0,
  }
}

async function executeGroupSexTemplate(charId: string, useTemplateB: boolean): Promise<void> {
  const tmpl = getOrCreateTemplate(charId)
  const template = useTemplateB ? tmpl.B : tmpl.A
  const slots = [template.mouth, template.L_hand, template.R_hand, template.penis, template.anal]

  for (const slot of slots) {
    if (!slot.targetId || !slot.behaviorId) continue
    const target = entitySystem.get('character', slot.targetId) as any
    if (!target) continue
    await apiSystem.call('effect-system', 'execute', [
      { type: 'h_execute_behavior', params: { behaviorId: slot.behaviorId, target: 'self' } }
    ], {
      sourceId: charId,
      _targetIds: [slot.targetId],
      _timeCost: 10,
    })
  }

  if (template.worship.targetIds.length > 0 && template.worship.behaviorId) {
    for (const worshipId of template.worship.targetIds) {
      const target = entitySystem.get('character', worshipId) as any
      if (!target) continue
      await apiSystem.call('effect-system', 'execute', [
        { type: 'h_execute_behavior', params: { behaviorId: template.worship.behaviorId, target: 'self' } }
      ], {
        sourceId: charId,
        _targetIds: [worshipId],
        _timeCost: 10,
      })
    }
  }

  if (tmpl.dualRun) {
    tmpl._lastUsedB = !tmpl._lastUsedB
  }
}

function applyGroupSexCostReduction(charId: string, hpCost: number, mpCost: number): { hp: number; mp: number } {
  const ch = entitySystem.get('character', charId) as any
  if (!groupSexMode || !ch?.h_state?.is_h) return { hp: hpCost, mp: mpCost }
  if (charId === 'player' || charId === '0') {
    return { hp: Math.ceil(hpCost / 3), mp: Math.ceil(mpCost / 3) }
  }
  return { hp: Math.ceil(hpCost / 2), mp: Math.ceil(mpCost / 2) }
}

function applyGroupSexAudienceBonus(charId: string, baseAdjust: number): number {
  const ch = entitySystem.get('character', charId) as any
  if (!groupSexMode || !ch?.h_state?.is_h) return baseAdjust
  const sceneCount = entitySystem.getAll('character').length
  const otherNpcNum = Math.min(10, Math.max(0, sceneCount - 2))
  return baseAdjust + otherNpcNum * 0.02
}

function applyGroupSexRealtimeTick(charId: string, addTime: number): void {
  const ch = entitySystem.get('character', charId) as any
  if (!groupSexMode || !ch?.h_state?.is_h) return
  const sceneCount = entitySystem.getAll('character').length
  const othersCount = Math.max(0, sceneCount - 2)
  const adjust = Math.min(othersCount * 0.1, 2)
  if (!ch?.base) return
  ch.base['羞耻'] = Math.min(99999, (ch.base['羞耻'] ?? 0) + Math.floor(addTime * adjust))
  ch.base['心理快感'] = Math.min(99999, (ch.base['心理快感'] ?? 0) + Math.floor(addTime * adjust))
}

export function onLoad(_ctx: PluginContext): void {
  // 注释：group_sex_mode_on — 启用群交模式（erArk 10010）
  effectTypeRegistry.register('group_sex_mode_on', (_p: any, execCtx: any) => {
    groupSexMode = true
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (ch) {
        if (!ch.achievement) ch.achievement = {}
        if (!ch.achievement.group_sex_record) ch.achievement.group_sex_record = {}
      }
    }
    narrativeLog.write('进入群交模式', 'system', 'h-group-sex')
    return true
  })

  // 注释：group_sex_mode_off — 关闭群交模式（erArk 10011）
  effectTypeRegistry.register('group_sex_mode_off', (_p: any, _execCtx: any) => {
    groupSexMode = false
    narrativeLog.write('退出群交模式', 'system', 'h-group-sex')
    return true
  })

  // 注释：group_sex_end_add_hpmp_max — 全体参与者HPMP上限增长（erArk 529）
  // 对应 default.py:6755-6814
  // orgasm_count = 所有身体部位 h_state.orgasm_count[state_id][0] 的总和
  effectTypeRegistry.register('group_sex_end_add_hpmp_max', (_p: any, _execCtx: any) => {
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (!c?.h_state?.is_h) continue
      // 注释：erArk: 遍历所有快感状态，sum orgasm_count[state_id][0]
      const oc = c.h_state.orgasm_count as Record<string, number[]> ?? {}
      let orgasmCount = 0
      for (const arr of Object.values(oc)) { if (Array.isArray(arr) && arr.length > 0) orgasmCount += arr[0] }
      if (orgasmCount <= 0) continue
      if (!c.base) c.base = {}
      c.base['体力上限'] = Math.min(99999, (c.base['体力上限'] ?? 0) + orgasmCount * 2)
      c.base['气力上限'] = Math.min(99999, (c.base['气力上限'] ?? 0) + orgasmCount * 3)
      c.base['欲望'] = Math.max(0, (c.base['欲望'] ?? 0) - orgasmCount * 20)
      if (c.id === 'player' || c.id === '0') {
        c.base['精液上限'] = Math.min(999, (c.base['精液上限'] ?? 0) + orgasmCount)
      }
    }
    return true
  })

  // 注释：group_sex_fail_add_just — 群交失败结算（erArk 530）
  effectTypeRegistry.register('group_sex_fail_add_just', (_p: any, _execCtx: any) => {
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (!c?.h_state?.is_h) continue
      if (!c.base) c.base = {}
      c.base['体力'] = Math.max(1, (c.base['体力'] ?? 0) - 10)
      c.base['气力'] = Math.max(1, (c.base['气力'] ?? 0) - 10)
    }
    const refused = entitySystem.getAll('character').filter((c: any) =>
      c?.action_info?.ask_group_sex_refuse_chara_id_list?.length
    )
    for (const c of refused) {
      narrativeLog.write(`${c.name ?? c.id} 拒绝了群交邀请`, 'system', 'h-group-sex')
    }
    return true
  })

  // 注释：all_group_sex_temple_on — 启用A/B轮换（erArk 1415）
  effectTypeRegistry.register('all_group_sex_temple_on', (_params: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      getOrCreateTemplate(id).dualRun = true
    }
    return true
  })

  // 注释：all_group_sex_temple_off — 关闭A/B轮换（erArk 1416）
  effectTypeRegistry.register('all_group_sex_temple_off', (_params: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      getOrCreateTemplate(id).dualRun = false
    }
    return true
  })

  // 注释：self_join_group_sex_on — NPC开始前往加入群交（erArk 1417）
  effectTypeRegistry.register('self_join_group_sex_on', (params: any, execCtx: any) => {
    const charId = params.characterId ?? execCtx.sourceId
    if (!charId) return true
    const ch = entitySystem.get('character', charId) as any
    if (!ch) return true
    if (!ch.sp_flag) ch.sp_flag = {}
    ch.sp_flag.go_to_join_group_sex = true
    narrativeLog.write(`${ch.name ?? charId} 正在前往加入群交`, 'system', 'h-group-sex')
    return true
  })

  // 注释：self_join_group_sex_off — NPC停止前往加入（erArk 1418）
  effectTypeRegistry.register('self_join_group_sex_off', (params: any, execCtx: any) => {
    const charId = params.characterId ?? execCtx.sourceId
    if (!charId) return true
    const ch = entitySystem.get('character', charId) as any
    if (!ch) return true
    if (ch.sp_flag) ch.sp_flag.go_to_join_group_sex = false
    return true
  })

  // 注释：clear_group_sex_template — 清除群交模板（erArk 1419）
  effectTypeRegistry.register('clear_group_sex_template', (params: any, execCtx: any) => {
    const target = params.target ?? 'self'
    const ids = target === 'self' ? [execCtx.sourceId] : execCtx._targetIds as string[]
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (ch?.h_state) ch.h_state.group_sex_body_template = defaultTemplate()
    }
    return true
  })

  // 注释：all_chara_masturebate_in_group_sex_flag_0 — 重置群交自慰标志（erArk 460）
  effectTypeRegistry.register('all_chara_masturebate_in_group_sex_flag_0', (_p: any, _execCtx: any) => {
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (c?.sp_flag) c.sp_flag.masturebate = 0
    }
    return true
  })
}

export async function onEnable(ctx: PluginContext): Promise<void> {
  // 注释：helper — 注册前提
  const reg = (id: string, fn: (c: any) => boolean) => {
    try { ctx.api.call('h-core', 'registerPremise', id, fn) } catch { }
  }

  // 注释：Step 2 — 全局模式前提
  reg('GROUP_SEX_MODE_ON', () => groupSexMode)
  reg('GROUP_SEX_MODE_OFF', () => !groupSexMode)

  // 注释：Step 3 — 模板前提
  reg('HAVE_ONE_GRUOP_SEX_TEMPLE', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    const tmpl = getOrCreateTemplate(id).A
    return [tmpl.mouth, tmpl.L_hand, tmpl.R_hand, tmpl.penis, tmpl.anal]
      .some(s => s.targetId !== null) || tmpl.worship.targetIds.length > 0
  })
  reg('HAVE_OVER_ONE_GRUOP_SEX_TEMPLE', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    const t = getOrCreateTemplate(id)
    const hasA = [t.A.mouth, t.A.L_hand, t.A.R_hand, t.A.penis, t.A.anal].some(s => s.targetId !== null) || t.A.worship.targetIds.length > 0
    const hasB = [t.B.mouth, t.B.L_hand, t.B.R_hand, t.B.penis, t.B.anal].some(s => s.targetId !== null) || t.B.worship.targetIds.length > 0
    return hasA && hasB
  })
  reg('ALL_GROUP_SEX_TEMPLE_RUN_ON', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    return getOrCreateTemplate(id).dualRun
  })
  reg('ALL_GROUP_SEX_TEMPLE_RUN_OFF', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    return !getOrCreateTemplate(id).dualRun
  })

  // 注释：Step 4 — NPC AI 前提
  reg('NPC_AI_TYPE_0_IN_GROUP_SEX', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    return getOrCreateTemplate(id).npcAiType === 0
  })
  reg('NPC_AI_TYPE_1_IN_GROUP_SEX', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    return getOrCreateTemplate(id).npcAiType === 1
  })
  reg('NPC_AI_TYPE_2_IN_GROUP_SEX', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    return getOrCreateTemplate(id).npcAiType === 2
  })
  reg('NPC_AI_TYPE_3_IN_GROUP_SEX', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    return getOrCreateTemplate(id).npcAiType === 3
  })

  // 注释：Step 5 — 场景前提
  reg('SCENE_OVER_TWO', (_ctx2: any) => {
    return entitySystem.getAll('character').length > 2
  })
  reg('SCENE_ALL_NOT_H', (_ctx2: any) => {
    return !entitySystem.getAll('character').some((c: any) => c?.h_state?.is_h)
  })
  reg('SCENE_ALL_NOT_TIRED', (_ctx2: any) => {
    return !entitySystem.getAll('character').some((c: any) => (c?.base?.['疲劳'] ?? 0) > 74)
  })

  // 注释：Step 6 — 流程前提
  reg('SELF_NOW_GO_TO_JOIN_GROUP_SEX', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    const ch = entitySystem.get('character', id) as any
    return ch?.sp_flag?.go_to_join_group_sex === true
  })
  reg('SELF_NOT_GO_TO_JOIN_GROUP_SEX', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    const ch = entitySystem.get('character', id) as any
    return ch?.sp_flag?.go_to_join_group_sex !== true
  })
  reg('INSTRUCT_JUDGE_GROUP_SEX', () => groupSexMode)
  reg('INSTRUCT_NOT_JUDGE_GROUP_SEX', () => !groupSexMode)

  // 注释：Step 8 — 注册公共 API
  ctx.api.register('h-group-sex', {
    isActive: () => groupSexMode,
    getTemplate: (charId: string) => getOrCreateTemplate(charId),
    setTemplate: (charId: string, template: any) => {
      const ch = entitySystem.get('character', charId) as any
      if (ch?.h_state) ch.h_state.group_sex_body_template = template
    },
    setNpcAiType: (charId: string, type: number) => {
      getOrCreateTemplate(charId).npcAiType = Math.max(0, Math.min(3, type))
    },
    getNpcAiType: (charId: string): number => getOrCreateTemplate(charId).npcAiType,
    getNpcAiName: (type: number): string => NPC_AI_NAMES[type] ?? '未知',
  })

  // 注释：Step 9 — 注册事件监听

  // 每次 H 行动后，群交模式中应用观众加成
  ctx.events.on('game:execution_end', (payload: any) => {
    if (!groupSexMode) return
    const addTime = payload?.timeCost ?? 10
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (!c?.h_state?.is_h) continue
      applyGroupSexRealtimeTick(c.id, addTime)
    }
  })

  // 群交中检查角色疲劳退出
  // 对应 erArk handle_npc_ai.py:55-94
  ctx.events.on('game:mode_changed', (payload: any) => {
    if (!groupSexMode || payload?.mode !== 'h_scene') return
    // TODO: 当NPC疲劳时自动执行group_sex_npc_hp_0_end
    // TODO: 剩余1NPC → 转单人H，剩余0 → 结束群交
  })

  // 注释：Step 10 — 指令注册（待 h-core 指令加载器就绪）
  // TODO: 注册 ask_group_sex 指令（前提+效果链）
  // TODO: 注册 group_sex_end 指令（前提+效果链）
  // TODO: 注册 run_group_sex_template 指令（调用 executeGroupSexTemplate）
  // TODO: 注册 edit_group_sex_template 指令（打开模板编辑器面板）

  // 注释：Step 11 — 注册 UI 插槽 — 群交状态标签
  try {
    ctx.ui.registerSlot('character-tag', {
      id: 'group-sex-tag',
      component: 'GroupSexTag' as any,
      priority: 45,
      condition: () => groupSexMode,
    })
  } catch { /* UI 未就绪 */ }

  // 注释：注册 UI 插槽 — 模板编辑器面板
  // TODO: 编辑群交模板面板（槽位分配 + NPC 邀请 + AI 类型选择）
}
