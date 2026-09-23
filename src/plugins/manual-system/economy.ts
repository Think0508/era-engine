// 注释：manual-system 经验经济（2026-09-23）——击败敌人 → 玩家获得「经验」
//
// 为什么在本插件：修炼的经验来源就是它（一个功能的同两半）。全部数值走 manual-config.toml，
// 引擎零硬编码；将来若经验来源扩展（采集/任务/交易），可整体抽为独立插件——对外接口只有
// 「经验」属性与 combat:end 事件。
//
// 规则：
//  · 只有**玩家**获得经验（队友/ NPC 不给——队友学秘籍耗的是玩家的经验）；
//  · 玩家必须在本场参与者里，且结果为胜；
//  · 每个敌方给 `血量上限 / kill_exp_divisor`（血量上限读绑定键 hp_max：未绑定/不可读 → warning + 跳过）；
//  · 首杀（该玩家**首次**击败"这种敌人"）× first_kill_multiplier，账本键 = `实体.template ?? 实体.id`
//    （spawnCharacter 实例化的敌人带 template；roster 角色数据本就有 template 字段）。

import { entitySystem } from '../../core/entity-system'
import { bindingResolver } from '../../core/binding-resolver'
import { applyAttrDelta } from '../../core/entity-utils'
import { errorReporter } from '../../core/error-reporter'
import { narrativeLog } from '../../core/narrative-log'
import { isPlayerChar } from '../../core/game-context'
import { config } from './context'

/** 首杀账本的键：优先"这类敌人"（模板），其次实体 ID */
export function killLedgerKey(enemy: any): string {
  const t = enemy?.template
  if (typeof t === 'string' && t.length > 0) return t
  return String(enemy?.id ?? '?')
}

/** 结算一场战斗的击破经验（导出供测试直调；实际由 combat:end 监听触发） */
export function settleKillExp(payload: any): number {
  const { outcome, participants, enemies } = payload ?? {}
  if (outcome !== 'win') return 0
  const ids: string[] = Array.isArray(participants) ? participants : []
  const player = ids.find(id => isPlayerChar(id))
  if (!player) return 0
  const char = entitySystem.get('character', player) as any
  if (!char) return 0
  const enemyIds: string[] = Array.isArray(enemies) ? enemies : []
  const cfg = config()
  let total = 0
  let counted = 0

  for (const enemyId of enemyIds) {
    const enemy = entitySystem.get('character', enemyId) as any
    if (!enemy) continue
    const hpMax = bindingResolver.get(enemyId, 'hp_max')
    // 注释：`null` = 该 mod **没有接入 hp_max**（没有插件绑定这个键）——视为"本 mod 不要击破经验"，
    // 静默跳过（example-mod 就是这种：它只有 hp，没有血量上限概念）。
    // 非 null 但非正数 = 绑定存在而数据畸形 → warning（这类才是真错，且要去修数据）。
    if (hpMax === null || hpMax === undefined) continue
    if (typeof hpMax !== 'number' || !Number.isFinite(hpMax) || hpMax <= 0) {
      errorReporter.reportDedup(`manual-kill-exp-hpmax:${enemyId}`, {
        source: 'manual-system', severity: 'warning',
        message: `击败经验结算跳过敌人 '${enemyId}'：血量上限（绑定键 hp_max）非正数（收到 ${String(hpMax)}）`,
        suggestion: '检查该敌人的血量上限属性值；或用 bindings.toml 把 hp_max 指到正确属性',
      })
      continue
    }
    const base = Math.max(0, Math.floor(hpMax / Math.max(1, cfg.kill_exp_divisor)))
    if (!char.kill_ledger || typeof char.kill_ledger !== 'object') char.kill_ledger = {}
    const key = killLedgerKey(enemy)
    const times = typeof char.kill_ledger[key] === 'number' ? char.kill_ledger[key] : 0
    const first = times <= 0
    char.kill_ledger[key] = times + 1
    const gain = first ? base * cfg.first_kill_multiplier : base
    total += gain
    counted++
  }

  if (total <= 0) return 0
  applyAttrDelta(char, cfg.exp_attr, total)
  narrativeLog.write(`击败敌人，获得 ${total} 点${cfg.exp_attr}（${counted} 名敌人）`, 'system', 'manual-system')
  return total
}
