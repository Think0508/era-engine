// 注释：共享测试基座——指令/结算测试统一复用，避免各测试文件维护各自的 execCtx/reset 副本
// 历史教训（2026-08-08）：instruction-chat 的 resetChars 漏重置 sp_flag → 时停测试污染后续全部
// 测试（成功链静默全挂、排查数轮）。统一基座保证字段补全一次到位，新指令测试直接复用。

import { apiSystem } from '../core/api'
import { eventBus } from '../core/event-bus'

/**
 * 创建标准执行上下文。
 * engine.emit 转发真实 eventBus（产品路径：bridge 注入 gameContext.emit → eventBus）——
 * 否则 execution_start/end 被吞，衰减监听器/二段结算测不到（测试盲区）。
 */
export function makeTestExecCtx(overrides: any = {}): any {
  return {
    uiStore: {
      selectedCharacterId: 'npc_1',
      selectCharacter: () => {},
      setActivePanel: () => {},
      clearSelection: () => {},
    },
    gameStore: { player: { id: 'player' } },
    api: apiSystem,
    engine: {
      setExecutionState: () => {},
      emit: async (event: string, payload?: any) => { await eventBus.emit(event, payload) },
    },
    evaluateCondition: () => true,
    evaluatePremises: () => true,
    sourceId: 'player',
    ...overrides,
  }
}

/**
 * 全字段重置角色实体（镜像 applyAttributeDefaults 语义 + 测试可写字段）。
 * 必须覆盖：base 键集合 / abilities / talents / hypnosis / sp_flag / dead / body_items /
 * h_state / experience / action_info / current_location——漏任何一个都会跨测试污染。
 */
export function resetCharacterEntity(char: any, baseKeys: Record<string, number> = {}): void {
  if (!char) return
  char.base = { ...baseKeys }
  char.abilities = {}
  char.talents = {}
  char.experience = {}
  char.sp_flag = {}
  char.dead = undefined
  char.hypnosis = undefined
  char.body_items = undefined
  char.h_state = undefined
  char.action_info = {}
  char.current_location = 'town_square'
}

/** 标准 NPC base（含常用状态键——setEntityAttr 只写已有键，缺失键会落到直接属性） */
export const DEFAULT_NPC_BASE: Record<string, number> = {
  体力: 80, 体力上限: 100, 气力: 50, 气力上限: 100,
  好感度: 0, 信赖度: 0, 好意: 0, 快乐: 0, 恐怖: 0, 皮肤: 0, 心理: 0,
  疲劳度: 0, 欲情: 0, 先导: 0, 阴道: 0, 苦痛: 0, 恭顺: 0, 羞耻: 0, 屈服: 0, 习得: 0,
}

/** 标准玩家 base */
export const DEFAULT_PLAYER_BASE: Record<string, number> = {
  体力: 50, 体力上限: 100, 气力: 30, 气力上限: 100,
  好感度: 0, 信赖度: 0, 好意: 0, 快乐: 0, 疲劳度: 0,
}
