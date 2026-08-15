// 注释：工作/娱乐排班 + 个人时间规律（time_rules）——目标搜索前的排班决策
// erArk 对应物：find_character_target 的工作（type_index 21/22）与娱乐（31/32/33）
// 时段分支 + npc_auto_work_or_entertainment（auto_ai 免决策）。
// 顺序（作者意图强度降序）：time_rules（个人规律，显式意图最强）→ 工作（职责）
// → 娱乐（时段娱乐）。返回 null = 不在任何排班时段（走目标搜索）。

import { modLoader } from '../../core/mod-loader'
import { gameContext } from '../../core/game-context'
import { weightedRandom } from '../../utils/weighted-random'
import { moveHandler } from './behavior-handlers'
import type { BehaviorBlock, EntertainmentPeriod, EntertainmentTypeDef, WorkTypeDef } from './types'

// 注释：娱乐时段（erArk judge_entertainment_time，game_time.py）——
// 1=上午 9-12，2=下午 14-18，3=晚上 19-22，0=无（半开区间 [start, end)）
const PERIOD_HOURS: [EntertainmentPeriod, [number, number]][] = [
  ['morning', [9, 12]],
  ['afternoon', [14, 18]],
  ['evening', [19, 22]],
]

export function currentPeriod(): EntertainmentPeriod | null {
  const hour = gameContext.getContext().time.hour
  for (const [period, [start, end]] of PERIOD_HOURS) {
    if (hour >= start && hour < end) return period
  }
  return null
}

// 注释：当前小时是否在时段内（半开区间 [start, end)——8-12 含 8:00 不含 12:00；
// 与娱乐/时间规律一致；2026-08-10 排查修复：此前闭区间导致 12:00 仍算"在班"
// 且与 workHandler 的开区间判定不一致）
function hourInRange(hour: number, range: [number, number]): boolean {
  return hour >= range[0] && hour < range[1]
}

// 注释：时段结束小时（半开区间 → 结束 = range[1]）
function rangeEndHour(range: [number, number]): number {
  return range[1]
}

// 注释：排班决策——返回行为块或 null（null = 走目标搜索）
// startTime：新行为开始时刻（erArk：旧行为结束时刻）
export async function tryScheduleBehavior(
  charId: string,
  char: any,
  now: number,
  startTime: number,
): Promise<BehaviorBlock | null> {
  // 1. 个人时间规律（time_rules）——加权随机选匹配规则
  const rules = (char?.behavior?.time_rules as { hour_range: [number, number]; target: string; weight?: number }[] | undefined)
  if (rules && rules.length > 0) {
    const hour = gameContext.getContext().time.hour
    const matched = rules.filter(r => hourInRange(hour, r.hour_range))
    if (matched.length > 0) {
      const pick = weightedRulePick(matched)
      if (pick) {
        const atTarget = char.current_location === pick.target
        if (!atTarget) {
          return moveHandler({
            charId, char, now, start_time: startTime,
            spec: { type: 'move', name: '移动' },
            params: { to: pick.target },
          })
        }
        // 注释：已在目标地 → 停留至规则结束（until_hour = 时段末）
        return {
          id: 'timerule_stay',
          type: 'stay',
          start_time: startTime,
          duration: minutesUntilHourSafe(rangeEndHour(pick.hour_range)),
          target: pick.target,
          params: { rule: pick },
        }
      }
    }
  }

  // 2. 工作（仅 auto_ai——非 auto_ai 工种由 mod 在 ai-targets.toml 定义目标）
  const workTypeId = char?.behavior?.work?.work_type as string | undefined
  const mod = modLoader.getMod() as any
  const workDef: WorkTypeDef | undefined = workTypeId ? mod?.aiWorkTypes?.[workTypeId] : undefined
  if (workDef && workDef.auto_ai) {
    const hour = gameContext.getContext().time.hour
    const inShift = workDef.time_slots.some(slot => hourInRange(hour, slot))
    if (inShift) {
      const atWork = char.current_location === workDef.place
      if (!atWork) {
        return moveHandler({
          charId, char, now, start_time: startTime,
          spec: { type: 'move', name: '移动' },
          params: { to: workDef.place },
        })
      }
      // 注释：在岗 auto_ai → 直接工作（免目标搜索，erArk npc_auto_work_or_entertainment）
      return {
        id: 'work',
        type: 'work',
        start_time: startTime,
        duration: minutesUntilHourSafe(rangeEndHour(workDef.time_slots.find(slot => hourInRange(hour, slot))!)),
        target: workDef.place,
        params: { work_type: workTypeId },
      }
    }
  }

  // 3. 娱乐（每日三时段槽）
  const period = currentPeriod()
  if (period) {
    const entTypeId = char?.behavior?.entertainment?.types?.[period] as string | undefined
    const entDef: EntertainmentTypeDef | undefined = entTypeId ? mod?.aiEntertainmentTypes?.[entTypeId] : undefined
    if (entDef) {
      const atPlace = char.current_location === entDef.place
      if (!atPlace) {
        return moveHandler({
          charId, char, now, start_time: startTime,
          spec: { type: 'move', name: '移动' },
          params: { to: entDef.place },
        })
      }
      const endHour = period === 'morning' ? 12 : period === 'afternoon' ? 18 : 22
      return {
        id: 'entertainment',
        type: 'entertainment',
        start_time: startTime,
        duration: minutesUntilHourSafe(endHour),
        target: entDef.place,
        params: { entertainment_type: entTypeId },
      }
    }
  }

  return null
}

// 注释：规则加权随机（weight 缺省 1；全 0 → 第一个）——统一走 utils/weighted-random（C3）
function weightedRulePick(
  rules: { target: string; hour_range: [number, number]; weight?: number }[],
): { target: string; hour_range: [number, number]; weight?: number } | null {
  return weightedRandom(rules.map(r => ({ item: r, weight: r.weight ?? 1 })))
}

// 注释：到某小时的分钟数——已过（≤0）→ 明天同刻。
// 注意：只对 ≤0 兜底（恰在班末 1-5 分钟时保留真实短时长——连锁会自然补一轮；
// 此前 ≤5 兜底会把"班末 1 分钟"变成"24 小时"（静默超长工作）——2026-08-10 排查修复）
function minutesUntilHourSafe(hour: number): number {
  const time = gameContext.getContext().time
  let m = (hour - time.hour) * 60 - time.minute
  if (m <= 0) m += 24 * 60
  return m
}
