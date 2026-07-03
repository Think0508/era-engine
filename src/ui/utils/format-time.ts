// 注释：format-time 时间格式化工具
// 有 calendar：秋之月 9日(四) 10时33分（用 month_names/weekday_names/hour_names）
// 无 calendar：第1月 9日 10:33（fallback 纯数字）
// 星期 = day % 7（TODO: 复杂历法后续扩展）

import type { GameTimeData } from '../../core/types'
import type { CalendarConfig } from '../stores/game-store'

export function formatTime(time: GameTimeData, calendar?: CalendarConfig | null, showWeekday = false): string {
  if (calendar && calendar.month_names.length > 0) {
    return formatWithCalendar(time, calendar, showWeekday)
  }
  return formatWithoutCalendar(time)
}

function formatWithCalendar(time: GameTimeData, calendar: CalendarConfig, showWeekday: boolean): string {
  const monthName = calendar.month_names[(time.month - 1) % calendar.month_names.length]
  // 注释：星期名——默认不显示，通过 showWeekday 控制
  const weekdayPart = showWeekday && calendar.weekday_names.length > 0
    ? `(${calendar.weekday_names[time.day % calendar.weekday_names.length]})`
    : ''
  // 注释：有时辰名则用时辰，否则 24 小时制
  const hourPart = calendar.hour_names && calendar.hour_names.length > 0
    ? `${calendar.hour_names[Math.floor(time.hour / 2) % calendar.hour_names.length]}时`
    : `${time.hour.toString().padStart(2, '0')}时`
  const minuteStr = time.minute.toString().padStart(2, '0')

  return `${monthName} ${time.day}日${weekdayPart} ${hourPart}${minuteStr}分`
}

function formatWithoutCalendar(time: GameTimeData): string {
  // 注释：fallback 纯数字格式
  const minuteStr = time.minute.toString().padStart(2, '0')
  return `第${time.month}月 ${time.day}日 ${time.hour}:${minuteStr}`
}
