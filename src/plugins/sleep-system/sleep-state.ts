// 睡眠状态管理——sp_flag.sleeping / sp_flag.unnormal_flag(bit5,6) / 睡眠等级推导
// erArk 对照：sleep 标记 + unnormal_flag 位掩码（11-睡眠与无意识H.md §6：5=0x10 意识模糊/弱交互、
// 6=0x20 完全意识不清醒/无交互；settle_chara_unnormal_flag 在 sleep_settle.py/realtime_settle.py:368-369 设置）
// 条件字段镜像：sleeping 镜像到实体顶层（condition_fields 消费——条件路径 resolution 只走实体直接键）

import { modLoader } from '../../core/mod-loader'
import { getEntityAttr, ATTR } from '../../core/entity-utils'

export const UNNORMAL_BIT_5 = 0x10
export const UNNORMAL_BIT_6 = 0x20

const FALLBACK_LEVELS = [
  { name: '半梦半醒', sleep_point: 30 },
  { name: '浅睡', sleep_point: 60 },
  { name: '熟睡', sleep_point: 80 },
  { name: '完全深眠', sleep_point: 100 },
]

export interface SleepLevelInfo {
  level: number
  name: string
}

// 按熟睡值推导睡眠等级（erArk attr_calculation.py:783-798 get_sleep_level：
// 值 ≤ 阈值 → 该级；否则下一级；最后一项为封顶级）。阈值来自 sleep.toml（mod 可覆盖），缺省 30/60/80/100
export function getSleepLevelInfo(sleepPoint: number): SleepLevelInfo {
  const levels = modLoader.getMod()?.sleepConfig?.sleep_levels
  const list = levels && levels.length > 0 ? levels : FALLBACK_LEVELS
  for (let i = 0; i < list.length; i++) {
    if (sleepPoint <= list[i].sleep_point) {
      return { level: i, name: list[i].name }
    }
  }
  const last = list[list.length - 1]
  return { level: list.length - 1, name: last.name }
}

// 角色当前睡眠等级（读熟睡值属性）
export function getSleepLevel(char: any): number {
  if (!char) return 0
  const sp = getEntityAttr(char, ATTR.SLEEP)
  return getSleepLevelInfo(typeof sp === 'number' ? sp : 0).level
}

// 是否正在睡眠（T_ACTION_SLEEP 前提语义——erArk handle_action_sleep：行为是 SLEEP）
export function isSleeping(char: any): boolean {
  return !!char?.sp_flag?.sleeping
}

// 入睡——设 sleeping + unnormal bit5,6（浅睡+ 完全意识不清醒语义）
export function setAsleep(char: any): void {
  if (!char) return
  if (!char.sp_flag) char.sp_flag = {}
  char.sp_flag.sleeping = true
  char.sp_flag.unnormal_flag = (char.sp_flag.unnormal_flag ?? 0) | UNNORMAL_BIT_5 | UNNORMAL_BIT_6
  char.sleeping = true
}

// 醒来——清 sleeping + unnormal bit5,6
export function clearAsleep(char: any): void {
  if (!char) return
  if (char.sp_flag) {
    char.sp_flag.sleeping = false
    char.sp_flag.unnormal_flag = (char.sp_flag.unnormal_flag ?? 0) & ~(UNNORMAL_BIT_5 | UNNORMAL_BIT_6)
  }
  char.sleeping = false
}
