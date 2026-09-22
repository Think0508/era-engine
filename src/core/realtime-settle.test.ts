// G3 决策测试（2026-08-09）：射精欲自然消退（erArk realtime_settle.py:144-149）
// 仅玩家、非 H、距上次射精 >30 分钟 → -10/分钟（下限 0）
import { describe, it, expect, beforeEach } from 'vitest'
import { realtimeSettle } from './realtime-settle'
import { gameTimeToTotalMinutes, gameContext } from './game-context'
import { entitySystem } from './entity-system'
import { getEntityAttr, readRawAttr } from './entity-utils'
import { configureAttributeEval, registerRuntimeMod } from './attribute-eval'

function registerChar(id: string, base: Record<string, number>, extra: any = {}): any {
  entitySystem.register('character', id, { id, base, action_info: {}, ...extra })
  // 注释：玩家上下文（settleEjaDecay 按 gameContext 玩家 id 判定——2026-08-13 审计对齐）
  if (id === 'player') {
    gameContext.setPlayer('player')
  }
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

describe('realtimeSettle（G4/G5 迁移注记）', () => {
  beforeEach(() => {
    entitySystem.clear()
    gameContext.reset()
  })

  it('睡眠结算的 wake 侧（daily_reset 清零/愤怒重置）已迁移至 sleep-system updateSleepAll——core 只留数值', async () => {
    const { modLoader } = await import('./mod-loader')
    await modLoader.loadMod('test-mod')
    const char = registerChar('sleep_npc', {
      体力: 50, 体力上限: 100, 气力: 50, 气力上限: 100,
      皮肤: 500, 胸部: 200, 心理: 300, 愤怒: 88, 疲劳度: 40,
    })
    realtimeSettle(char, 60, { isSleep: true })
    // daily_reset 清零（G4）与愤怒重置（G5）不在 core——由 sleep-system updateSleepAll 对全员执行
    expect(char.base['皮肤']).toBe(500)
    expect(char.base['愤怒']).toBe(88)
    // core 只保留 settle_sleep 数值：疲劳 2 倍削减 + 熟睡积累 + 体力/气力公式恢复
    expect(char.base['疲劳度']).toBe(20) // 40 - max(1, 60/6)×2 = 40-20
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

describe('realtimeSettle（睡眠体力/气力公式恢复——erArk settle_sleep realtime_settle.py:388-391）', () => {
  beforeEach(() => {
    entitySystem.clear()
    gameContext.reset()
  })

  it('体力恢复 = (上限×0.0025+3)/分钟，气力 = (上限×0.005+6)/分钟，封顶上限', () => {
    // 上限 100：体力 base=0.25+3=3.25/分 → 60 分钟 = floor(195)=195 → 钳 100
    const char = registerChar('sleep_recover', { 体力: 50, 体力上限: 100, 气力: 50, 气力上限: 100 })
    realtimeSettle(char, 60, { isSleep: true })
    expect(char.base['体力']).toBe(100) // 50 + 195 → 钳 100
    expect(char.base['气力']).toBe(100) // 50 + floor(0.5+6)×60 = 50+390 → 钳 100
  })

  it('恢复量精确：上限 1000 → 体力 5.5/分，60 分钟 = floor(330)=330；气力 11/分 → 660', () => {
    const char = registerChar('sleep_recover_exact', { 体力: 100, 体力上限: 1000, 气力: 100, 气力上限: 1000 })
    realtimeSettle(char, 60, { isSleep: true })
    expect(char.base['体力']).toBe(430) // 100 + floor((2.5+3)×60)
    expect(char.base['气力']).toBe(760) // 100 + floor((5+6)×60)
  })

  it('非睡眠结算不按睡眠公式恢复（休息恢复走指令 effects）', () => {
    const char = registerChar('rest_no_recover', { 体力: 50, 体力上限: 100, 气力: 50, 气力上限: 100 })
    realtimeSettle(char, 60, { isRest: true })
    expect(char.base['体力']).toBe(50)
    expect(char.base['气力']).toBe(50)
  })

  it('NPC 睡眠窗口（sleepPassSettle）同样恢复（erArk 全员同构）', async () => {
    const { sleepPassSettle } = await import('./realtime-settle')
    configureAttributeEval({ definitions: { 体力: {}, 体力上限: {} } }) // 读时封顶投影需要属性定义
    const char = registerChar('npc_sleeper', { 体力: 50, 体力上限: 100, 气力: 50, 气力上限: 100, 熟睡值: 0, 疲劳度: 60 })
    sleepPassSettle(char, 60)
    // 2026-09-23 末轮「写入端不再按属性上限钳制」语义变更（原断言 base 体力 = 100）：
    // 公式恢复量 (100×0.0025+3)×60 = 195 整段落进**裸值** → 50+195 = 245；超出上限的部分**读不出来**
    // （读时封顶投影：读出来是 100）。裸值多余部分在下次 realtimeSettle 的 clampHpMp 会被拉回基础上限。
    expect(char.base['体力']).toBe(245)
    expect(getEntityAttr(char, '体力')).toBe(100)
    expect(char.base['疲劳度']).toBe(40) // 60 - 20
    expect(char.base['熟睡值']).toBe(90) // 60 × 1.5（无 tired_adjust，I6 修复）
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

  it('浅睡熟睡积累无 tired_adjust（erArk :362-367 源码无系数，I6 修复）：疲劳 80 → 60 分钟 ×1.5 = 90', () => {
    const char = registerChar('sleep_shallow', { 熟睡值: 0, 疲劳度: 80, 体力: 100, 体力上限: 100, 气力: 100, 气力上限: 100 })
    realtimeSettle(char, 60, { isSleep: true })
    // floor(60×1.5)=90（旧实现含 tired_adjust=1.5 → 135 封顶 100，已修正）
    expect(char.base['熟睡值']).toBe(90)
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

// ── 2026-09-23 审计 Fix 2（同类清扫）：结算的操作数一律来自**基础值域** ────────────
// 原实现读 `getEntityAttr`（有效值）再加增量写回基础值 → 属性上的临时修正（attr_mods：
// 状态/装备/战斗 modify_attribute）被烘进 base 并逐次复利。探针：疲劳度 raw 0 +
// {attr:'疲劳度',flat:+20} → 一次结算后 raw 22（应为 2），撤掉修正仍是 22。
describe('realtimeSettle 基础值域（临时修正不沉淀）', () => {
  beforeEach(() => {
    entitySystem.clear()
    gameContext.reset()
    configureAttributeEval({ definitions: { 疲劳度: {}, 体力: {}, 体力上限: {} } })
  })

  it('settleTired：增量落基础值，有效值仍含修正', () => {
    const c = registerChar('npc_tired', { 疲劳度: 0 })
    registerRuntimeMod(c, { id: 'status:疲劳', attr: '疲劳度', flat: 20 }, 20)
    expect(getEntityAttr(c, '疲劳度')).toBe(20)
    realtimeSettle(c, 12)                          // add = max(1, 12/6) = 2
    expect(readRawAttr(c, '疲劳度')).toBe(2)        // 旧实现：20 + 2 = 22
    expect(getEntityAttr(c, '疲劳度')).toBe(22)     // 有效值 = 2 + 20
  })

  it('clampHpMp：钳位两端都是基础值（有效体力不写回 base）；读出的有效值按有效上限封顶', () => {
    const c = registerChar('npc_hp', { 体力: 100, 体力上限: 120 })
    registerRuntimeMod(c, { id: 'status:体力', attr: '体力', flat: 50 }, 50)
    // 2026-09-23 末轮「读时封顶」语义变更（原断言 150 = "有效值超过上限 120"）：裸值 100 + 修正 50 的
    // 150 不再作为对外可见的有效值 —— 读出来被**有效上限** 120 封顶（裸值本身不受影响，仍是 100）。
    expect(getEntityAttr(c, '体力')).toBe(120)
    realtimeSettle(c, 10)
    expect(readRawAttr(c, '体力')).toBe(100)        // 旧实现：clampAttrValue(150)=120 写进 base
    expect(getEntityAttr(c, '体力')).toBe(120)
  })

  it('基础值真的超上限时仍然钳制（不是把钳位整个关掉）', () => {
    const c = registerChar('npc_hp2', { 体力: 500, 体力上限: 120 })
    realtimeSettle(c, 10)
    expect(readRawAttr(c, '体力')).toBe(120)
  })
})
