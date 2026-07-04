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
void groupSexMode
void NPC_AI_NAMES
void getSelfId
void getTargetId
void getOrCreateTemplate

export function onLoad(_ctx: PluginContext): void {
  // 注释：TODO Task 3 — 注册 10 个效果类型
}

export async function onEnable(ctx: PluginContext): Promise<void> {
  void ctx
  // 注释：TODO Task 2 — 注册 16 个前提
  // 注释：TODO Task 3 — 注册公共 API
  // 注释：TODO Task 5 — 注册事件监听 + 公式钩子
}
