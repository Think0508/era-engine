// 每日结算——游戏时间过午夜时触发
// 对齐 erark Script/Settle/past_day_settle.py

import { entitySystem } from './entity-system'
import { getEntityAttr, setEntityAttr } from './entity-utils'
import { gameContext } from './game-context'

let lastSettledDay = -1
let lastSettledMonth = -1

/** 每日结算——同一天内只做一次 */
export function newDaySettle(): void {
  const ctx = gameContext.getContext()
  const today = ctx.time.day
  const month = ctx.time.month

  // 同一天同一月已结算过 → 跳过
  if (today === lastSettledDay && month === lastSettledMonth) return
  lastSettledDay = today
  lastSettledMonth = month

  const allChars = entitySystem.getAll('character')
  for (const char of allChars as any[]) {
    if (!char.id) continue
    // G2 决策 2026-08-09：欲望每日增长仅 NPC（erArk past_day_settle.py:76 `if character_id:`
    // 排除玩家；玩家欲望由 H/自慰/药物链置 79/0/100，B3 指令化时带）
    if (char.id === 'player' || char.id === '0') continue
    // 欲望积累：随机(ability[33] ~ ability[33]*2)——33=欲望，abilities 按名存
    const abl33 = char.abilities?.['欲望']?.level ?? 0
    if (abl33 > 0) {
      const add = abl33 + Math.floor(Math.random() * (abl33 + 1))
      const desire = getEntityAttr(char, '欲望值')
      if (typeof desire === 'number') {
        const newVal = Math.min(100, desire + add)
        setEntityAttr(char, '欲望值', newVal)
      }
    }
  }
}
