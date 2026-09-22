// 注释：上限成长站点的读-改-写回归测试（2026-09-22 全分支审查 C1 清扫）
//
// 背景：属性读取自 2026-09-22 起返回**有效值**（基础值 + 派生 + 修正），而写入写的是**基础值**。
// `settleEndHHpmpGrowth` 原本是 `setEntityAttr(HP_MAX, getEntityAttr(HP_MAX) + n)` —— 读有效值再加、
// 写回基础值：一旦该属性挂了修正，修正常量就会被**烘焙进 base**，且每次成长再烙一遍（无界膨胀）。
// 本文件钉死清扫后的行为：成长只加在基础值上，修正永远不落进 base。
import { describe, it, expect, beforeEach } from 'vitest'
import { entitySystem } from '../../../core/entity-system'
import { narrativeLog } from '../../../core/narrative-log'
import { modLoader } from '../../../core/mod-loader'
import { errorReporter } from '../../../core/error-reporter'
import { getEntityAttr, ATTR } from '../../../core/entity-utils'
import { configureAttributeEval, registerModifier, __resetAttributeEval } from '../../../core/attribute-eval'
import { settleEndHHpmpGrowth } from './hpmp-growth'

function mkPlayer(): any {
  return {
    id: 'player',
    name: '测试者',
    base: { [ATTR.HP_MAX]: 500, [ATTR.MP_MAX]: 300, [ATTR.SEMEN_MAX]: 0, [ATTR.DESIRE]: 100 },
    // 本次 H 绝顶 3 次（orgasm_count[part][0] 求和）
    h_state: { orgasm_count: { a: [3, 0] } },
  }
}

describe('上限成长 × 基础值域（C1 清扫回归）', () => {
  beforeEach(() => {
    __resetAttributeEval()
    entitySystem.clear()
    narrativeLog.clear()
    errorReporter.clear()
    // playerCharacter = 本角色 → 跳过 NPC 能力升级分支（不需要 ability-progression）
    ;(modLoader as any).loadedMod = { playerCharacter: 'player' }
  })

  it('挂了 +500 上限修正时，成长只加基础值（修正不被烘焙进 base）', async () => {
    const p = mkPlayer()
    entitySystem.register('character', 'player', p)
    configureAttributeEval({ definitions: { [ATTR.HP_MAX]: {}, [ATTR.MP_MAX]: {} } })
    registerModifier(p, 'equip', ATTR.HP_MAX, { flat: 500 })

    expect(getEntityAttr(p, ATTR.HP_MAX)).toBe(1000)   // 有效值 = 500 + 500

    await settleEndHHpmpGrowth('player')

    // 绝顶 3 次 → 体力上限 +6 / 气力上限 +9，全部落在**基础值**上
    expect(p.base[ATTR.HP_MAX]).toBe(506)              // 不是 1006（那会把 +500 烙进去）
    expect(p.base[ATTR.MP_MAX]).toBe(309)              // 未挂修正：与清扫前逐位一致
    // 有效值 = 新基础值 + 修正，且修正只算一次
    expect(getEntityAttr(p, ATTR.HP_MAX)).toBe(1006)
  })

  it('连续两次成长不累积烙入（膨胀会在这里暴露）', async () => {
    const p = mkPlayer()
    entitySystem.register('character', 'player', p)
    configureAttributeEval({ definitions: { [ATTR.HP_MAX]: {} } })
    registerModifier(p, 'equip', ATTR.HP_MAX, { flat: 500 })

    await settleEndHHpmpGrowth('player')
    p.h_state = { orgasm_count: { a: [3, 0] } }        // 第二场 H 同样 3 次
    await settleEndHHpmpGrowth('player')

    expect(p.base[ATTR.HP_MAX]).toBe(512)              // 500 + 6 + 6
    expect(getEntityAttr(p, ATTR.HP_MAX)).toBe(1012)   // 1012（膨胀写法会得到 1012+1000 级数字）
  })

  it('精液量上限：按基础值成长且封顶 999', async () => {
    const p = mkPlayer()
    p.base[ATTR.SEMEN_MAX] = 996
    entitySystem.register('character', 'player', p)
    configureAttributeEval({ definitions: {} })

    await settleEndHHpmpGrowth('player')

    expect(p.base[ATTR.SEMEN_MAX]).toBe(999)           // 996 + 3 → 封顶 999（不是 999+3）
  })
})
