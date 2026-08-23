/**
 * 口上展示参数——唯一源类型（2026-08-23 收敛）：
 * 此前 style/trigger/display/speed/pause/color/size/font 在 ReactiveLine /
 * TalkDisplayFields / LogEntry._display / VariableData 等多处重复声明并漂移
 * （style 只进数据层、ReactiveLine 无枚举）。现统一：
 * - TalkDisplayFields：渲染语义字段（trigger/display/speed/pause/color/size/font），
 *   供 LogDisplay（叙事日志）与数据层引用；
 * - StyledTalkDisplay：含命名样式引用（style 只在数据层存在，渲染层解析后产出
 *   TalkDisplayFields 值集）。
 * core 定义，plugins/UI 引用（分层合规：core 不认识 plugins，plugins 可依赖 core）。
 */

export interface TalkDisplayFields {
  trigger?: 'auto' | 'click'
  display?: 'instant' | 'typewriter'
  /** 逐字速度（毫秒/可见字），仅 display=typewriter 生效 */
  speed?: number
  /**
   * 本条显示完后自动暂停的毫秒数（trigger=auto 时生效；2026-08-23 恢复原始设计）：
   * 全屏 EXECUTING 流（FullscreenOutput）中该条（含 typewriter 播完）显示完自动停顿
   * N 毫秒再继续下一条；等待期间点击可跳过（era autopage 惯例）。
   * 列表模式（NarrativeLog 滚动日志）无流语义，该字段无效。
   */
  pause?: number
  /** 支持引擎色值 #RRGGBB / #AARRGGBB（渲染层经 toCssColor 转 CSS） */
  color?: string
  /** 仅 small / large 在渲染层映射为 em（其余值无效） */
  size?: string
  font?: string
}

/** 数据层可引用的展示字段（含 [styles] 命名样式引用） */
export interface StyledTalkDisplay extends TalkDisplayFields {
  style?: string
}