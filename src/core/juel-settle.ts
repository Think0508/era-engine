// 宝珠转换链（2026-08-11 成长系统）——复刻 erArk sleep_settle.settle_character_juel（:103-151）
// + attr_calculation.get_juel（:601-631）：睡眠结算时把 daily_reset 状态值（快感/行为参数）
// 按状态等级衰减率转为对应宝珠（juel），然后清零状态值；最后反感珠抵消。
// 此前宝珠系统被砍（对账表 juel 有意删减，只留清零）——2026-08-11 用户要求完整复刻，恢复转换链。

import { getEntityAttr, setEntityAttr, getLevel } from './entity-utils'
import { modLoader } from './mod-loader'

// 注释：状态等级 → 转换率（erArk get_juel：LV0-1 = 100%，LV10 = 10%）
const JUEL_CONVERSION_RATE = [1, 1, 0.9, 0.75, 0.6, 0.4, 0.3, 0.2, 0.15, 0.12, 0.1]

// 注释：特殊状态（erArk sleep_settle.py:134-138）——苦痛/恐怖/抑郁珠的 1/4 到自身、1/2 到反感珠
const SPECIAL_STATUS = [17, 18, 19]

// 注释：反感珠抵消优先级（erArk sleep_settle.py:142-151）——1 好珠灭 2 反感珠
const REVERSE_PRIORITY = [15, 10, 11, 12, 13]

/**
 * 睡眠宝珠转换（对单个角色）——读 daily_reset 状态值 → 转珠 → 清零 → 反感抵消。
 * 返回叙事文本行（空 = 无变化）。转换前应已按 attributes.toml 校验 daily_reset 属性。
 */
export function settleJuelConversion(entity: any): string[] {
  const text: string[] = []
  const mod = modLoader.getMod()
  if (!mod?.juelDefs) return text
  if (!entity?.juel) entity.juel = {}

  // 1. 状态值 → 宝珠（status_attr 对应的 daily_reset 属性）
  for (const [juelIdStr, def] of Object.entries(mod.juelDefs)) {
    const juelId = Number(juelIdStr)
    if (Number.isNaN(juelId)) continue
    const statusAttr = def.status_attr
    if (!statusAttr) continue
    const statusValue = getEntityAttr(entity, statusAttr)
    // 注释：audit-i 修复——erArk sleep_settle.py 对 !=0 无条件转珠并清零；
    // 原 `<= 0 continue` 使负值（如负好感）跳过且**不清零** → 永久残留
    if (typeof statusValue !== 'number' || statusValue === 0) continue

    const attrDef = mod.attributes?.[statusAttr]
    const level = attrDef?.level_thresholds?.length
      ? getLevel(statusValue, attrDef.level_thresholds)
      : 0
    const rate = JUEL_CONVERSION_RATE[Math.min(level, JUEL_CONVERSION_RATE.length - 1)] ?? 1
    // 注释：erArk 用 Python round()（银行家舍入）；JS Math.round 四舍五入——量级差异可忽略（已记录）
    const addJuel = Math.round(statusValue * rate)

    if (SPECIAL_STATUS.includes(juelId)) {
      // 苦痛/恐怖/抑郁：1/4 到自身 + 1/2 到反感珠
      entity.juel[juelId] = (entity.juel[juelId] ?? 0) + Math.floor(addJuel / 4)
      entity.juel[20] = (entity.juel[20] ?? 0) + Math.floor(addJuel / 2)
    } else {
      entity.juel[juelId] = (entity.juel[juelId] ?? 0) + addJuel
    }
    // 清零状态值（宝珠转换后）
    setEntityAttr(entity, statusAttr, 0)
  }

  // 2. 反感珠抵消（1 好珠灭 2 反感珠，优先级 屈服→恭顺→好意→欲情→快乐）
  // 注意：循环内读 entity.juel[20] 实时值（快照会让抵消超支变负数——测试抓到）
  const reverse = entity.juel[20] ?? 0
  if (reverse > 0) {
    const offsets: string[] = []
    for (const goodId of REVERSE_PRIORITY) {
      if ((entity.juel[20] ?? 0) <= 0) break
      const good = entity.juel[goodId] ?? 0
      if (good <= 0) continue
      const juelDown = Math.min(entity.juel[20], good * 2)
      entity.juel[20] = (entity.juel[20] ?? 0) - juelDown
      entity.juel[goodId] = good - Math.floor(juelDown / 2)
      const name = mod.juelDefs[String(goodId)]?.name ?? String(goodId)
      offsets.push(` ${Math.floor(juelDown / 2)}个${name}`)
    }
    if (offsets.length > 0) {
      text.push(`当前共${reverse}反发珠，抵消了：${offsets.join('，')}，剩余${entity.juel[20] ?? 0}个反发珠`)
    }
  }
  return text
}
