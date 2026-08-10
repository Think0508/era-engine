// 注释：random-event-system 插件类型定义

/** 挂起的子事件选项（父事件触发后、玩家选择前） */
export interface PendingOption {
  /** 挂载行为 id */
  behaviorId: string
  /** 触发者 id */
  subjectId: string
  /** interactant（交互对象） */
  targetId: string | null
  /** 父事件 id */
  fatherId: string
  /** 选项列表（text 已插值） */
  options: { eventId: string; text: string }[]
  /** 是否玩家侧事件 */
  playerEvent: boolean
}
