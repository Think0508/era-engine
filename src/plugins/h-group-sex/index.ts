// 注释：h-group-sex 插件——群交系统，完全对齐 erArk
// 全局模式开关 + 5 槽位身体部位模板（口/左手/右手/阴茎/肛）+ 阴茎侍奉（最多4 NPC）
// 16 前提 + 10 效果 + HPMP 消耗减少 + 观众加成 + 结束结算

import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'

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

// 注释：获取角色的群交模板（返回默认空模板）
function getOrCreateTemplate(charId: string): { A: GroupSexTemplate; B: GroupSexTemplate; lock: boolean; dualRun: boolean; npcAiType: number } {
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

// 注释：保留引用，供后续任务使用（骨架阶段通过 void 抑制 noUnusedLocals）
void NPC_AI_NAMES

export function onLoad(_ctx: PluginContext): void {
  // 注释：TODO Task 3 — 注册 10 个效果类型
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

  // 注释：TODO Task 3 — 注册公共 API
  // 注释：TODO Task 5 — 注册事件监听 + 公式钩子
}
