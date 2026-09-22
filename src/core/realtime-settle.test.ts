// G3 决策测试（2026-08-09）：射精欲自然消退（erArk realtime_settle.py:144-149）
// 仅玩家、非 H、距上次射精 >30 分钟 → -10/分钟（下限 0）
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { realtimeSettle, sleepPassSettle, settleHunger, settleUrine } from './realtime-settle'
import { gameTimeToTotalMinutes, gameContext } from './game-context'
import { entitySystem } from './entity-system'
import { getEntityAttr, readRawAttr } from './entity-utils'
import { configureAttributeEval, registerRuntimeMod, removeRuntimeMod } from './attribute-eval'

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
    configureAttributeEval({ definitions: { 疲劳度: {}, 体力: {}, 体力上限: {}, 射精欲: {}, 射精欲上限: {} } })
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

  // 2026-09-23 末轮 Item 1：settleEjaDecay 是本文件最后一个「写回按**有效上限**钳制」的站点。
  // 消退是减量路径（"非负增量不反噬"守卫盖不到），临时 `射精欲上限 −N` 会把裸值永久截断。
  it('settleEjaDecay：临时「射精欲上限 −N」不截断裸值（写回不再按有效上限钳制）', () => {
    const now = gameTimeToTotalMinutes(gameContext.getContext().time)
    const c = registerChar('player', { 射精欲: 500, 射精欲上限: 1000 }, { action_info: { last_eaj_add_time: now - 60 } })
    registerRuntimeMod(c, { id: 'status:射精欲上限', attr: '射精欲上限', flat: -900 }, -900)
    try {
      expect(getEntityAttr(c, '射精欲上限')).toBe(100)   // 有效上限（「上限−900」立即生效）
      realtimeSettle(c, 10)                              // 消退 10 分钟 = −100
      // 修复前 `clampAttrValue(entity, '射精欲', 400)` 按有效上限写成 **100**（撤修正仍 100 = 永久 −400）
      expect(readRawAttr(c, '射精欲')).toBe(400)
      expect(getEntityAttr(c, '射精欲')).toBe(100)       // 读时封顶：裸值 400 读出来不超有效上限
    } finally {
      removeRuntimeMod(c, 'status:射精欲上限')
    }
  })
})

// ── 2026-09-23 末轮 Item 3：审计修过但**没有带修正测试**的站点，每站点一条最小回归 ──────────
// 判据只有一句：**挂上修正 → 该站点写回的裸值分毫不变**（修正只该出现在判据里）。
// 助手 rawPair：同一结算跑两遍（对照 / 挂 flat 修正），返回两次的裸值——并先自证修正真的生效
// （读时闸门没过的话用例会静默空转，那种"绿的假测试"比没测试更糟）。
describe('realtimeSettle 审计站点（最小回归：挂修正 → 裸值不变）', () => {
  let seq = 0
  beforeEach(() => {
    entitySystem.clear()
    gameContext.reset()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)   // 0.8 + 0.5×0.4 = 1.0 → 饥饿/尿意的随机系数固定为 1
    configureAttributeEval({
      definitions: {
        疲劳度: {}, 熟睡值: {}, 体力: {}, 体力上限: {}, 气力: {}, 气力上限: {},
        饥饿值: {}, 尿意: {}, 精液量: {}, 精液量上限: {},
      },
    })
  })
  afterEach(() => vi.restoreAllMocks())

  /** 每次调用造一个**新实体**（对照与实验组必须是两个对象） */
  function mkChar(base: Record<string, number>): () => any {
    return () => registerChar(`audit_${++seq}`, { ...base })
  }

  function rawPair(attr: string, flat: number, make: () => any, run: (c: any) => void): [any, any] {
    const control = make()
    const probe = make()
    registerRuntimeMod(probe, { id: 'audit:probe', attr, flat }, flat)
    try {
      // 修正确实生效（有效值被抬高——判据/显示读的是它）。用 > 而非 = raw+flat：读时封顶可能压住修正后的值。
      expect(getEntityAttr(probe, attr)).toBeGreaterThan(readRawAttr(control, attr))
      run(control)
      run(probe)
      return [readRawAttr(control, attr), readRawAttr(probe, attr)]
    } finally {
      removeRuntimeMod(probe, 'audit:probe')
    }
  }

  it('sleepPassSettle：疲劳度/熟睡值两个站点都从基础值取操作数', () => {
    const mk = mkChar({ 疲劳度: 60, 熟睡值: 0, 体力: 100, 体力上限: 100, 气力: 100, 气力上限: 100 })
    expect(rawPair('疲劳度', 30, mk, c => sleepPassSettle(c, 60))).toEqual([40, 40])   // 60 − 20（读有效值则 90−20=70）
    expect(rawPair('熟睡值', 40, mk, c => sleepPassSettle(c, 60))).toEqual([90, 90])   // 0 + 90（读有效值则 100）
  })

  it('sleepRecovery：体力/气力两个站点都从基础值取操作数', () => {
    // 修正 +60 把**有效值**顶到有效上限 100：判据若读有效值 → 「未满」不成立 → 整段恢复被跳过（裸值停在 50）
    const mk = mkChar({ 体力: 50, 体力上限: 100, 气力: 50, 气力上限: 100, 疲劳度: 0, 熟睡值: 0 })
    expect(rawPair('体力', 60, mk, c => sleepPassSettle(c, 60))).toEqual([245, 245])   // 50 + floor(3.25×60)
    expect(rawPair('气力', 60, mk, c => sleepPassSettle(c, 60))).toEqual([440, 440])   // 50 + floor(6.5×60)
  })

  it('settleHunger / settleUrine / settleSemen：三个站点都从基础值取操作数', () => {
    const mkHunger = mkChar({ 饥饿值: 10, 体力: 100, 体力上限: 100, 气力: 100, 气力上限: 100 })
    expect(rawPair('饥饿值', 100, mkHunger, c => settleHunger(c, 60))).toEqual([70, 70])   // 系数 1 → +60
    const mkUrine = mkChar({ 尿意: 10 })
    expect(rawPair('尿意', 100, mkUrine, c => settleUrine(c, 60))).toEqual([70, 70])       // +60
    const mkSemen = mkChar({ 精液量: 50, 精液量上限: 100 })
    expect(rawPair('精液量', 40, mkSemen, c => realtimeSettle(c, 60))).toEqual([53, 53])   // +3（读有效值则 93）
  })
})
