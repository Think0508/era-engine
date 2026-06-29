// 注释：format-time 时间格式化工具
// 有 calendar：秋之月 9日(四) 10时33分（用 month_names/weekday_names/hour_names）
// 无 calendar：第1月 9日 10:33（fallback 纯数字）
// 星期 = day % 7（TODO: 复杂历法后续扩展）

import type { GameTimeData } from '../../core/types'
import type { CalendarConfig } from '../stores/game-store'

export function formatTime(time: GameTimeData, calendar?: CalendarConfig | null): string {
  if (calendar && calendar.month_names.length > 0) {
    return formatWithCalendar(time, calendar)
  }
  return formatWithoutCalendar(time)
}

function formatWithCalendar(time: GameTimeData, calendar: CalendarConfig): string {
  // 注释：月名（month-1 索引）
  const monthName = calendar.month_names[(time.month - 1) % calendar.month_names.length]
  // 注释：星期名（day % 7）
  const weekdayName = calendar.weekday_names.length > 0
    ? calendar.weekday_names[time.day % calendar.weekday_names.length]
    : ''
  // 注释：时辰名（可选，每 2 小时一个时辰）
  const hourName = calendar.hour_names && calendar.hour_names.length > 0
    ? calendar.hour_names[Math.floor(time.hour / 2) % calendar.hour_names.length]
    : ''

  const weekdayPart = weekdayName ? `(${weekdayName})` : ''
  const hourPart = hourName ? `${hourName}时` : `${time.hour}时`

  return `${monthName} ${time.day}日${weekdayPart} ${hourPart}${time.minute}分`
}

function formatWithoutCalendar(time: GameTimeData): string {
  // 注释：fallback 纯数字格式
  const minuteStr = time.minute.toString().padStart(2, '0')
  return `第${time.month}月 ${time.day}日 ${time.hour}:${minuteStr}`
}
