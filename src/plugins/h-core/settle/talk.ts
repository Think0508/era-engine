// 注释：聊天计数器时间衰减——复刻 erArk change_character_talkcount_for_time（settle_behavior.py:560-581）
// 挂载点：h-core 监听 game:execution_start（每次玩家行动开始，对齐 erArk character_behavior.py:413）
// 语义：
//   同日且小时前进 → talk_count -= 小时差（talk_time 同步为 now）
//   跨天 → talk_count = 0（talk_time 同步）
//   下限 0；talk_time 为空 → 初始化为 now（不衰减）

export interface TalkTime {
  day: number
  hour: number
}

export function decayTalkCount(target: any, now: TalkTime): void {
  if (!target) return
  if (!target.action_info) target.action_info = {}
  const talkCount = target.action_info.talk_count ?? 0
  const talkTime = target.action_info.talk_time as TalkTime | undefined
  if (!talkTime) {
    target.action_info.talk_time = { day: now.day, hour: now.hour }
    return
  }
  let newCount = talkCount
  if (now.day === talkTime.day && now.hour > talkTime.hour) {
    newCount = talkCount - (now.hour - talkTime.hour)
    talkTime.hour = now.hour
  } else if (now.day !== talkTime.day) {
    newCount = 0
    talkTime.day = now.day
    talkTime.hour = now.hour
  }
  target.action_info.talk_count = Math.max(0, newCount)
}
