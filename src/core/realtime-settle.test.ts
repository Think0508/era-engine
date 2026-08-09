// G3 决策测试（2026-08-09）：射精欲自然消退（erArk realtime_settle.py:144-149）
// 仅玩家、非 H、距上次射精 >30 分钟 → -10/分钟（下限 0）
import { describe, it, expect, beforeEach } from 'vitest'
import { realtimeSettle } from './realtime-settle'
import { gameTimeToTotalMinutes, gameContext } from './game-context'
import { entitySystem } from './entity-system'

function registerChar(id: string, base: Record<string, number>, extra: any = {}): any {
  entitySystem.register('character', id, { id, base, action_info: {}, ...extra })
  return entitySystem.get('character', id) as any
}

describe('realtimeSettle（G3：射精欲自然消退）', () => {
  beforeEach(() => {
    entitySystem.clear()
    gameContext.reset()
  })

  it('距上次射精 >30 分钟 → 射精欲 -10/分钟', () => {
    const now = gameTimeToTotalMinutes(gameContext.getContext().time)
    const char = registerChar('player', { 射精欲: 500 }, { action_info: { last_eaj_add_time: now - 60 } })
    realtimeSettle(char, 10)
    expect(char.base['射精欲']).toBe(400) // 500 - 10×10
  })

  it('距上次射精 ≤30 分钟 → 不消退', () => {
    const now = gameTimeToTotalMinutes(gameContext.getContext().time)
    const char = registerChar('player', { 射精欲: 500 }, { action_info: { last_eaj_add_time: now - 10 } })
    realtimeSettle(char, 60)
    expect(char.base['射精欲']).toBe(500)
  })

  it('H 中（h_state.is_h）→ 不消退', () => {
    const now = gameTimeToTotalMinutes(gameContext.getContext().time)
    const char = registerChar('player', { 射精欲: 500 }, {
      action_info: { last_eaj_add_time: now - 60 },
      h_state: { is_h: true },
    })
    realtimeSettle(char, 10)
    expect(char.base['射精欲']).toBe(500)
  })

  it('NPC（非玩家）→ 不消退（erArk 仅 character_id==0）', () => {
    const now = gameTimeToTotalMinutes(gameContext.getContext().time)
    const char = registerChar('npc_a', { 射精欲: 500 }, { action_info: { last_eaj_add_time: now - 60 } })
    realtimeSettle(char, 10)
    expect(char.base['射精欲']).toBe(500)
  })

  it('下限 0（不会减成负数）', () => {
    const now = gameTimeToTotalMinutes(gameContext.getContext().time)
    const char = registerChar('player', { 射精欲: 50 }, { action_info: { last_eaj_add_time: now - 60 } })
    realtimeSettle(char, 10)
    expect(char.base['射精欲']).toBe(0)
  })

  it('无 last_eaj_add_time（未射过精）→ 不消退', () => {
    const char = registerChar('player', { 射精欲: 500 })
    realtimeSettle(char, 10)
    expect(char.base['射精欲']).toBe(500)
  })
})

describe('realtimeSettle（G4：睡眠快感清零——daily_reset 标记消费）', () => {
  beforeEach(() => {
    entitySystem.clear()
    gameContext.reset()
  })

  it('睡眠结算：daily_reset=true 属性归零，非 daily_reset 保留', async () => {
    // 加载 mod 使 attributes 可用（daily_reset 标记来自 attributes.toml）
    const { modLoader } = await import('./mod-loader')
    await modLoader.loadMod('test-mod')
    // 注意：loadMod 已注册 test-mod 的 player，用不冲突的 id；体力上限须给足
    // （clampHpMp 会把超上限的体力钳到上限，上限缺失=0 会钳掉体力）
    const char = registerChar('sleep_npc', {
      体力: 50, 体力上限: 100, 气力: 50, 气力上限: 100,
      好感度: 60,          // 非 daily_reset → 保留
      皮肤: 500, 胸部: 200, 心理: 300, // daily_reset（快感部位）→ 归零
    })
    realtimeSettle(char, 60, { isSleep: true })
    expect(char.base['皮肤']).toBe(0)
    expect(char.base['胸部']).toBe(0)
    expect(char.base['心理']).toBe(0)
    expect(char.base['体力']).toBe(50)
    expect(char.base['好感度']).toBe(60)
  })

  it('非睡眠结算不清零（休息不清）', async () => {
    const { modLoader } = await import('./mod-loader')
    await modLoader.loadMod('test-mod')
    const char = registerChar('rest_npc', { 皮肤: 500 })
    realtimeSettle(char, 60, { isRest: true })
    expect(char.base['皮肤']).toBe(500)
  })

  it('无 mod 时不崩溃（daily_reset 标记不可用则跳过）', async () => {
    const { modLoader } = await import('./mod-loader')
    ;(modLoader as any).loadedMod = null // 测试隔离：前一测试 loadMod 过
    const char = registerChar('player', { 皮肤: 500 })
    realtimeSettle(char, 60, { isSleep: true })
    expect(char.base['皮肤']).toBe(500)
  })
})

describe('realtimeSettle（G5：愤怒重置——睡眠醒来 rand(1,35)）', () => {
  beforeEach(() => {
    entitySystem.clear()
    gameContext.reset()
  })

  it('睡眠结算 → 愤怒重置为 rand(1,35)', () => {
    const char = registerChar('sleep_angry', { 愤怒: 88 })
    realtimeSettle(char, 60, { isSleep: true })
    const angry = char.base['愤怒']
    expect(angry).toBeGreaterThanOrEqual(1)
    expect(angry).toBeLessThanOrEqual(35)
  })

  it('非睡眠结算不重置愤怒', () => {
    const char = registerChar('rest_angry', { 愤怒: 88 })
    realtimeSettle(char, 60, { isRest: true })
    expect(char.base['愤怒']).toBe(88)
  })
})

describe('realtimeSettle（G6：尿意上限 300 + 熟睡 tired_adjust/深睡区间对齐）', () => {
  beforeEach(() => {
    entitySystem.clear()
    gameContext.reset()
  })

  it('尿意上限 300（erArk 代码 min(...,300)，注释 240 以代码为准）', () => {
    const char = registerChar('urine_cap', { 尿意: 295, 体力: 100, 体力上限: 100, 气力: 100, 气力上限: 100 })
    realtimeSettle(char, 60)
    expect(char.base['尿意']).toBe(300)
  })

  it('浅睡熟睡积累含 tired_adjust（1+疲劳/160）：疲劳 80 → 60 分钟 ×(1+0.5)×1.5 = 135 → 上限 100', () => {
    const char = registerChar('sleep_shallow', { 熟睡值: 0, 疲劳度: 80, 体力: 100, 体力上限: 100, 气力: 100, 气力上限: 100 })
    realtimeSettle(char, 60, { isSleep: true })
    // floor(60×1.5×1.5)=135 → min(100)
    expect(char.base['熟睡值']).toBe(100)
  })

  it('浅睡无疲劳 → 60 分钟 ×1×1.5 = 90（tired_adjust=1）', () => {
    const char = registerChar('sleep_fresh', { 熟睡值: 0, 疲劳度: 0, 体力: 100, 体力上限: 100, 气力: 100, 气力上限: 100 })
    realtimeSettle(char, 60, { isSleep: true })
    expect(char.base['熟睡值']).toBe(90)
  })

  it('深睡区间 rand(-0.3~0.6)×tired_adjust，下界钳 0', () => {
    // 疲劳 0 → adjust=1，60 分钟 → add ∈ [-18, 36]（floor）
    const char = registerChar('sleep_deep', { 熟睡值: 90, 疲劳度: 0, 体力: 100, 体力上限: 100, 气力: 100, 气力上限: 100 })
    realtimeSettle(char, 60, { isSleep: true })
    const v = char.base['熟睡值']
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThanOrEqual(100)
  })
})

describe('mod-loader（G5：愤怒初始化 rand(1,35)——finalizeCharacterData）', () => {
  beforeEach(() => {
    entitySystem.clear()
    gameContext.reset()
  })

  it('新角色无愤怒键 → 随机 1-35', async () => {
    const { parseModData, finalizeCharacterData } = await import('./mod-loader')
    const mod = parseModData('test-mod', {
      '/mods/test-mod/meta.toml': '[meta]\nid = "test-mod"\nname = "t"\nversion = "1.0.0"\n',
      '/mods/test-mod/definitions/attributes.toml': '[attributes]\n"愤怒" = { type = "number", default = 0, category = "base" }\n',
      '/mods/test-mod/characters/roster.toml': '[[roster]]\nid = "fresh"\nname = "新角色"\n',
    })
    const char: any = { id: 'fresh', name: '新角色' }
    finalizeCharacterData(char, mod)
    expect(char.base['愤怒']).toBeGreaterThanOrEqual(1)
    expect(char.base['愤怒']).toBeLessThanOrEqual(35)
  })

  it('已有愤怒键（模板/roster 显式写）→ 保留', async () => {
    const { parseModData, finalizeCharacterData } = await import('./mod-loader')
    const mod = parseModData('test-mod', {
      '/mods/test-mod/meta.toml': '[meta]\nid = "test-mod"\nname = "t"\nversion = "1.0.0"\n',
      '/mods/test-mod/definitions/attributes.toml': '[attributes]\n"愤怒" = { type = "number", default = 0, category = "base" }\n',
      '/mods/test-mod/characters/roster.toml': '[[roster]]\nid = "calm"\nname = "冷静"\nbase = { "愤怒" = 50 }\n',
    })
    const char: any = { id: 'calm', name: '冷静', base: { '愤怒': 50 } }
    finalizeCharacterData(char, mod)
    expect(char.base['愤怒']).toBe(50)
  })

  it('重复 finalize（pendingSpawns 二次补全）不重复随机', async () => {
    const { parseModData, finalizeCharacterData } = await import('./mod-loader')
    const mod = parseModData('test-mod', {
      '/mods/test-mod/meta.toml': '[meta]\nid = "test-mod"\nname = "t"\nversion = "1.0.0"\n',
      '/mods/test-mod/definitions/attributes.toml': '[attributes]\n"愤怒" = { type = "number", default = 0, category = "base" }\n',
      '/mods/test-mod/characters/roster.toml': '[[roster]]\nid = "twice"\nname = "二次"\n',
    })
    const char: any = { id: 'twice', name: '二次' }
    finalizeCharacterData(char, mod)
    const first = char.base['愤怒']
    finalizeCharacterData(char, mod)
    expect(char.base['愤怒']).toBe(first)
  })
})
