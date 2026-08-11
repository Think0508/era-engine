// H 结束上限成长（2026-08-11 成长系统）——复刻 erArk default.py:
// handle_end_h_add_hpmp_max（:6700-6753，528 END_H_ADD_HPMP_MAX）+ 群交版
// handle_group_sex_end_h_add_hpmp_max（:6756-6814）：H 结束时按"本次 H 绝顶次数"成长。
// 在 endHScene 清 h_state 之前调用（orgasm_count 数据源 = h_state.orgasm_count[part][0]）。

import { getEntityAttr, setEntityAttr, ATTR } from '../../../core/entity-utils'
import { narrativeLog } from '../../../core/narrative-log'
import { apiSystem } from '../../../core/api'
import { errorReporter } from '../../../core/error-reporter'
import { modLoader } from '../../../core/mod-loader'
import { entitySystem } from '../../../core/entity-system'

/**
 * 对单个角色执行 H 结束上限成长（erArk :6711-6753）：
 * - 统计本次 H 绝顶次数（orgasm_count[part][0] 全 part 求和）
 * - 体力上限 += 次数×2 / 气力上限 += 次数×3（:6735-6736）
 * - 欲望值 -= 次数×20（下限 0，:6739）
 * - 玩家额外：精液量上限 += 次数（上限 999，:6741-6744）
 * - NPC：能力升级结算（:6752-6753，gain_ability——mod 开关 upgrade_on_npc_h_end）
 */
export async function settleEndHHpmpGrowth(charId: string): Promise<void> {
  const char = entitySystem.get('character', charId) as any
  if (!char?.h_state?.orgasm_count) return

  let orgasmCount = 0
  for (const [, pair] of Object.entries(char.h_state.orgasm_count) as [string, number[]][]) {
    orgasmCount += pair?.[0] ?? 0
  }
  if (orgasmCount <= 0) return

  const name = char.name ?? charId
  const hpMax = getEntityAttr(char, ATTR.HP_MAX)
  const mpMax = getEntityAttr(char, ATTR.MP_MAX)
  if (typeof hpMax === 'number') setEntityAttr(char, ATTR.HP_MAX, hpMax + orgasmCount * 2)
  if (typeof mpMax === 'number') setEntityAttr(char, ATTR.MP_MAX, mpMax + orgasmCount * 3)

  const desire = getEntityAttr(char, ATTR.DESIRE)
  if (typeof desire === 'number' && desire > 0) {
    setEntityAttr(char, ATTR.DESIRE, Math.max(0, desire - orgasmCount * 20))
  }

  const playerId = modLoader.getMod()?.playerCharacter
  let text = `在激烈的H之后，${name}的体力上限增加了${orgasmCount * 2}，气力上限增加了${orgasmCount * 3}`
  if (char.id === playerId) {
    const semenMax = getEntityAttr(char, ATTR.SEMEN_MAX)
    if (typeof semenMax === 'number' && semenMax < 999) {
      const next = Math.min(999, semenMax + orgasmCount)
      setEntityAttr(char, ATTR.SEMEN_MAX, next)
      text += `，精液量上限增加了${orgasmCount}`
    }
  }
  narrativeLog.write(text, 'system', 'h-core')

  // NPC 自动能力升级（erArk :6752 base_setting[2]；mod 开关 upgrade_on_npc_h_end）
  const settings = modLoader.getMod()?.upgradeSettings ?? { player_sleep: true, npc_sleep: true, npc_h_end: true }
  if (char.id !== playerId && settings.npc_h_end) {
    try {
      await apiSystem.call('abilities', 'checkUpgrade', charId)
    } catch (err) {
      errorReporter.report({
        source: 'h-core',
        severity: 'warning',
        message: `H结束能力升级失败（${charId}）：${err instanceof Error ? err.message : String(err)}`,
        suggestion: '检查 ability-progression 插件是否已加载',
      })
    }
  }
}
