import type { StyledTalkDisplay } from '../../core/talk-display'

/**
 * 口上展示参数（整体修饰，ADR 0018）——行为词条可选字段，语义与行结构
 * （lines 的 trigger/display/speed/pause/color/size/font + [styles] 命名样式）
 * 对齐：被选中词条的这些字段随文本输出为叙事日志的 LogDisplay。
 * 类型来自 core 唯一源 StyledTalkDisplay（2026-08-23 收敛），此处别名保留名字避免连锁改名。
 */
export type TalkDisplayFields = StyledTalkDisplay

export interface CommonTextRawEntry extends TalkDisplayFields {
  context: string
  conditions?: string
  part?: string
}

export interface CommonTextRawVariable {
  variable: string
  description?: string
  parts?: string[]
  entries: CommonTextRawEntry[]
}

export interface CommonTextEntry extends TalkDisplayFields {
  context: string
  conditions: string[]
  part?: string
  /** 加载期预计算：条件引用的前提列表（weightAllToOne 权重用——免运行时正则提取） */
  premiseRefs: string[]
  /** 加载期预计算：条件是否含 unconscious 引用（无意识过滤检查用——免运行时正则） */
  hasUnconsciousRef: boolean
}

export interface CommonTextVariable {
  variable: string
  description: string
  parts: string[]
  entries: CommonTextEntry[]
}

export interface CommonTextIndex {
  [variable: string]: CommonTextVariable
}
