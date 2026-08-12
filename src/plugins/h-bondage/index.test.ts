// 注释：h-bondage 测试——bondage_tick 欲情能力读键（audit-b I2）
// 背景：bondage_tick 欲情系数读 `abilities['欲情']`（恒 0——ABL 里没有'欲情'能力，
// 欲望 才是 ability[33]），应读 `abilities['欲望']`。文件注释 :142-144 已自证
// （欲情(12) → ability[33] → get_ability_adjust）。

import { describe, it, expect, beforeAll } from 'vitest'
import TOML from '@iarna/toml'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { onLoad } from './index'

describe('h-bondage', () => {
  beforeAll(() => {
    entitySystem.clear()
    effectTypeRegistry.clear()
    // 注释：loadBondageTypes 优先走 globalThis.TOML（生产运行时由 h-core 挂载），
    // 测试环境无挂载 → 补上，否则退化的手写解析器只保留最后一个 type
    ;(globalThis as any).TOML = TOML
    onLoad({} as any)
  })

  function makeChar(id: string, init: any = {}): any {
    const char: any = { id, name: id, ...init }
    entitySystem.register('character', id, char)
    return char
  }

  function runBondageTick(charId: string, timeCost = 10): void {
    const handler = effectTypeRegistry.getHandler('bondage_tick')
    if (!handler) throw new Error('bondage_tick 未注册')
    handler({}, { _targetIds: [charId], _timeCost: timeCost })
  }

  it('bondage_tick 欲情系数读 ability 欲望（非欲情键）：lv5 → floor(30×(1.8+0.5))=69', () => {
    const ch = makeChar('t_bond', {
      h_state: { bondage: 1 },  // 双手缚 level 1 → adjust = 0.5
      base: { 欲情: 0, 羞耻: 0, 苦痛: 0 },
      abilities: { 欲望: { level: 5, xp: 0 } },
    })
    runBondageTick('t_bond', 10)
    // timeBase = 10×3 = 30；lustAdj = getAbilityAdjust(5)=1.8 + 0.5 = 2.3
    // 读错键（'欲情' 恒 0）→ 1.0+0.5=1.5 → 45
    expect(ch.base['欲情']).toBe(69)
    expect(ch.base['羞耻']).toBe(45)  // 露出 lv0 → 30×(1.0+0.5)
    expect(ch.base['苦痛']).toBe(45)  // 苦痛刻印 lv0 → 30×(1+0.5)
  })

  it('绑定中（bondage>0）才结算；未绑定跳过', () => {
    const ch = makeChar('t_free', { h_state: { bondage: 0 }, base: { 欲情: 0 } })
    runBondageTick('t_free', 10)
    expect(ch.base['欲情']).toBe(0)
  })
})
