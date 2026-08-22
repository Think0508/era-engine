// 注释：body-shape-system 单元测试——身材系统三情形 + 数值权威 + 档位互斥 + 性别闸 + 双向 set
// 覆盖（2026 grill 定稿）：
//   情形A 只有天赋无数值 → 落该档最小值（巨乳→90）
//   情形B 皆无 → 默认档懒物化（普乳/普臀，其 min=80；首次读取前零写入）
//   数值权威：数值存在 → 按数值重算天赋（覆盖冲突档 + warning）
//   性别闸：男/未写性别 → 一律跳过（返回 null，零写入）
//   互斥：同维度多档冲突 → 保留最小档 + warning；无关天赋（幼女等）原样保留
//   双向 set：setBust → 重算档 + 发 character:changed

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { commandRegistry } from '../../core/command-registry'
import { apiSystem } from '../../core/api'
import { modLoader } from '../../core/mod-loader'
import { conditionEngine } from '../../core/condition-engine'
import { onLoad as bsOnLoad, onEnable as bsOnEnable } from './index'
import { onLoad as ejacOnLoad, onEnable as ejacOnEnable } from '../h-ejaculation/index'

const stubCtx: any = { api: apiSystem, events: eventBus, commands: commandRegistry, ui: { registerSlot: () => {} } }

let booted = false
async function ensureBoot(): Promise<void> {
  if (booted) return
  booted = true
  await modLoader.loadMod('test-mod')
  bsOnLoad(stubCtx)
  bsOnEnable(stubCtx)
  // 注释：jj_0~3 前提由 h-ejaculation 注册（读 base.阴茎大小 派生镜像）——本文件验证镜像联动
  ejacOnLoad(stubCtx)
  ejacOnEnable(stubCtx)
}

function makeChar(id: string, over: any = {}): void {
  entitySystem.register('character', id, {
    id,
    name: id,
    base: { 性别: 2 },
    talents: {},
    ...over,
  })
}

const call = async (ns: string, method: string, ...args: any[]): Promise<any> =>
  (apiSystem as any).call(ns, method, ...args)

describe('body-shape-system 身材系统', () => {
  beforeAll(async () => {
    await ensureBoot()
  })

  beforeEach(() => {
    entitySystem.clear()
  })

  it('情形A：只有天赋无数值 → 懒物化落该档最小值（巨乳→90），臀不动', async () => {
    makeChar('a1', { talents: { 巨乳: 1 } })
    expect(await call('body-shape', 'getBust', 'a1')).toBe(90)
    const ch = entitySystem.get('character', 'a1') as any
    expect(ch.body_shape['胸围']).toBe(90)
    expect(ch.talents['巨乳']).toBe(1)
    expect(ch.talents['普乳']).toBeUndefined()
    expect(ch.body_shape['臀围']).toBeUndefined()   // 胸/臀逐维度独立懒物化
  })

  it('情形B：皆无 → 首次读取前零写入，读取后落默认档普乳及其 min=80', async () => {
    makeChar('b1')
    let ch = entitySystem.get('character', 'b1') as any
    expect(ch.body_shape?.['胸围']).toBeUndefined()
    expect(ch.talents['普乳']).toBeUndefined()
    const v = await call('body-shape', 'getBust', 'b1')
    expect(v).toBe(80)
    ch = entitySystem.get('character', 'b1') as any
    expect(ch.body_shape['胸围']).toBe(80)
    expect(ch.talents['普乳']).toBe(1)
    for (const t of ['绝壁', '贫乳', '巨乳', '爆乳']) expect(ch.talents[t]).toBeUndefined()
  })

  it('数值权威：数值存在且与手写天赋冲突 → 按数值重算天赋（普乳@95 → 巨乳）', async () => {
    makeChar('c1', { body_shape: { 胸围: 95 }, talents: { 普乳: 1 } })
    expect(await call('body-shape', 'getBust', 'c1')).toBe(95)
    const ch = entitySystem.get('character', 'c1') as any
    expect(ch.talents['巨乳']).toBe(1)
    expect(ch.talents['普乳']).toBeUndefined()
  })

  it('性别闸：男(1) 与 未写性别 → 返回 null 且零写入，手写天赋不动', async () => {
    makeChar('m1', { base: { 性别: 1 }, talents: { 巨乳: 1 } })
    expect(await call('body-shape', 'getBust', 'm1')).toBeNull()
    makeChar('g1', { base: {}, talents: { 巨乳: 1 } })
    expect(await call('body-shape', 'getHip', 'g1')).toBeNull()
    const m = entitySystem.get('character', 'm1') as any
    const g = entitySystem.get('character', 'g1') as any
    expect(m.body_shape?.['胸围']).toBeUndefined()
    expect(m.talents['巨乳']).toBe(1)
    expect(g.body_shape?.['臀围']).toBeUndefined()
    expect(await call('body-shape', 'setBust', 'm1', 120)).toBeNull()
  })

  it('双向 set：setBust 重算档（85→普乳 / 120→爆乳 / 74→绝壁）且发 character:changed', async () => {
    makeChar('d1')
    let fired = 0
    const handler = () => { fired++ }
    eventBus.on('character:changed', handler)
    try {
      expect(await call('body-shape', 'setBust', 'd1', 85)).toBe(85)
      let ch = entitySystem.get('character', 'd1') as any
      expect(ch.talents['普乳']).toBe(1)
      expect(await call('body-shape', 'setBust', 'd1', 120)).toBe(120)
      ch = entitySystem.get('character', 'd1') as any
      expect(ch.talents['爆乳']).toBe(1)
      expect(ch.talents['普乳']).toBeUndefined()
      expect(await call('body-shape', 'setBust', 'd1', 74)).toBe(74)
      ch = entitySystem.get('character', 'd1') as any
      expect(ch.talents['绝壁']).toBe(1)
      expect(fired).toBe(3)
    } finally {
      eventBus.off('character:changed', handler)
    }
  })

  it('边界：80→普乳 / 89→普乳 / 90→巨乳 / 99→巨乳 / 100→爆乳（min 闭 max 开）', async () => {
    makeChar('e1')
    for (const [cm, expectTier] of [[80, '普乳'], [89, '普乳'], [90, '巨乳'], [99, '巨乳'], [100, '爆乳']] as const) {
      await call('body-shape', 'setBust', 'e1', cm)
      expect(await call('body-shape', 'getChestTalent', 'e1')).toBe(expectTier)
    }
  })

  it('多档冲突：无数值 {贫乳,巨乳} → 保留最小档贫乳（min=75）+ 清冲突档', async () => {
    makeChar('f1', { talents: { 贫乳: 1, 巨乳: 1 } })
    expect(await call('body-shape', 'getBust', 'f1')).toBe(75)
    const ch = entitySystem.get('character', 'f1') as any
    expect(ch.talents['贫乳']).toBe(1)
    expect(ch.talents['巨乳']).toBeUndefined()
  })

  it('非身材天赋保留：{幼女,巨乳} + 胸围95 → 幼女/巨乳原样，普乳不出现', async () => {
    makeChar('g1', { body_shape: { 胸围: 95 }, talents: { 幼女: 1, 巨乳: 1 } })
    await call('body-shape', 'getBust', 'g1')
    const ch = entitySystem.get('character', 'g1') as any
    expect(ch.talents['幼女']).toBe(1)
    expect(ch.talents['巨乳']).toBe(1)
    expect(ch.talents['普乳']).toBeUndefined()
  })

  it('臀独立：只给巨臀 → getHip=90；getBust 仍按普通档懒物化（维度互不影响）', async () => {
    makeChar('h1', { talents: { 巨臀: 1 } })
    expect(await call('body-shape', 'getHip', 'h1')).toBe(90)
    expect(await call('body-shape', 'getBust', 'h1')).toBe(80)
    const ch = entitySystem.get('character', 'h1') as any
    expect(ch.body_shape['臀围']).toBe(90)
    expect(ch.talents['巨臀']).toBe(1)
    expect(ch.body_shape['胸围']).toBe(80)
    expect(ch.talents['普乳']).toBe(1)
  })

  it('setHip 同理：臀围/档 双向', async () => {
    makeChar('i1', { talents: { 普臀: 1 } })
    expect(await call('body-shape', 'setHip', 'i1', 95)).toBe(95)
    const ch = entitySystem.get('character', 'i1') as any
    expect(ch.talents['巨臀']).toBe(1)
    expect(ch.talents['普臀']).toBeUndefined()
  })

  // ── 身高维度（纯派生标签，不写天赋）──
  it('身高：懒物化默认档标准（min=160），且不写任何天赋', async () => {
    makeChar('h1')
    let ch = entitySystem.get('character', 'h1') as any
    expect(ch.body_shape?.['身高']).toBeUndefined()
    expect(await call('body-shape', 'getHeight', 'h1')).toBe(160)
    ch = entitySystem.get('character', 'h1') as any
    expect(ch.body_shape['身高']).toBe(160)
    // 身高不落天赋：小车/标准/大车（身高档标签）不得出现在 talents
    for (const t of ['小车', '标准', '大车']) expect(ch.talents[t]).toBeUndefined()
  })

  it('身高边界：159→小车 / 160→标准 / 174→标准 / 175→大车 / 999→大车', async () => {
    makeChar('h2')
    for (const [cm, tier] of [[159, '小车'], [160, '标准'], [174, '标准'], [175, '大车'], [999, '大车']] as const) {
      await call('body-shape', 'setHeight', 'h2', cm)
      expect(await call('body-shape', 'getHeightTier', 'h2')).toBe(tier)
    }
  })

  it('身高性别闸：男 → null 且零写入', async () => {
    makeChar('h3', { base: { 性别: 1 } })
    expect(await call('body-shape', 'getHeight', 'h3')).toBeNull()
    expect((entitySystem.get('character', 'h3') as any).body_shape?.['身高']).toBeUndefined()
  })

  it('身高 set 发 character:changed', async () => {
    makeChar('h4')
    let fired = 0
    const handler = () => { fired++ }
    eventBus.on('character:changed', handler)
    try {
      await call('body-shape', 'setHeight', 'h4', 170)
      expect(fired).toBe(1)
    } finally {
      eventBus.off('character:changed', handler)
    }
  })

  // ── hgt_N 前提（复刻 jj_0~3：查 actor=sourceId 的身高档 rank）──
  it('hgt_N 前提：0=小车 / 1=标准 / 2=大车', async () => {
    makeChar('ha', { body_shape: { 身高: 150 } })   // 小车
    makeChar('hb', { body_shape: { 身高: 168 } })   // 标准
    makeChar('hc', { body_shape: { 身高: 190 } })   // 大车
    const mkCtx = (id: string) => ({ player: null, location: null, time: { minute: 0, hour: 8, day: 1, month: 1, year: 1 }, selectedCharacterId: id, sourceId: id } as any)
    for (let n = 0; n <= 2; n++) {
      expect(conditionEngine.getPremiseValue(`hgt_${n}`, mkCtx('ha'))).toBe(n === 0)
      expect(conditionEngine.getPremiseValue(`hgt_${n}`, mkCtx('hb'))).toBe(n === 1)
      expect(conditionEngine.getPremiseValue(`hgt_${n}`, mkCtx('hc'))).toBe(n === 2)
    }
  })

  // ── 条件代理域 body_shape.*（读时 reconcile，懒物化正确）──
  it('代理域：body_shape.selected.胸围 读时 reconcile（[巨乳]未消费 → 90 → 条件真）', async () => {
    makeChar('pa', { talents: { 巨乳: 1 } })
    const ctx = { player: null, location: null, time: { minute: 0, hour: 8, day: 1, month: 1, year: 1 }, selectedCharacterId: 'pa', getEntity: () => null } as any
    expect(conditionEngine.evaluate('body_shape.selected.胸围 >= 90', ctx)).toBe(true)
    const ch = entitySystem.get('character', 'pa') as any
    expect(ch.body_shape['胸围']).toBe(90)   // 条件读取即物化
  })

  it('代理域：body_shape.{id}.臀围 / .身高 也读时 reconcile', async () => {
    makeChar('pb', { talents: { 巨臀: 1 } })
    const ctx = { player: null, location: null, time: { minute: 0, hour: 8, day: 1, month: 1, year: 1 }, getEntity: () => null } as any
    expect(conditionEngine.evaluate('body_shape.pb.臀围 >= 90', ctx)).toBe(true)
    expect(conditionEngine.evaluate('body_shape.pb.身高 < 200', ctx)).toBe(true)   // 默认标准160
  })

  it('代理域：性别闸一致（男 → undefined → 条件假）', async () => {
    makeChar('pc', { base: { 性别: 1 }, talents: { 巨乳: 1 } })
    const ctx = { player: null, location: null, time: { minute: 0, hour: 8, day: 1, month: 1, year: 1 }, selectedCharacterId: 'pc', getEntity: () => null } as any
    expect(conditionEngine.evaluate('body_shape.selected.胸围 >= 90', ctx)).toBe(false)
  })

  // ── 阴茎长度（男用纯派生档 + base.阴茎大小 派生镜像）──
  it('阴茎：性别闸（女）→ null 且零写入', async () => {
    makeChar('jf')   // 女
    expect(await call('body-shape', 'getPenisLength', 'jf')).toBeNull()
    expect((entitySystem.get('character', 'jf') as any).body_shape?.['阴茎长度']).toBeUndefined()
  })

  it('阴茎：男懒物化 → cm 落档（纯派生不写天赋）+ 镜像 base.阴茎大小 与档一致', async () => {
    makeChar('jm', { base: { 性别: 1 } })
    const cm = await call('body-shape', 'getPenisLength', 'jm')
    expect(typeof cm).toBe('number')
    expect(cm).toBeGreaterThanOrEqual(0)
    expect(cm).toBeLessThan(999)
    const tier = await call('body-shape', 'getPenisTier', 'jm')
    expect(['短小', '普通', '粗大', '巨根']).toContain(tier)
    const ch = entitySystem.get('character', 'jm') as any
    expect(ch.talents?.[tier]).toBeUndefined()           // 纯派生标签
    expect([0, 1, 2, 3]).toContain(ch.base['阴茎大小'])
    expect(ch.base['阴茎大小']).toBe(['短小', '普通', '粗大', '巨根'].indexOf(tier))  // 镜像一致
  })

  it('阴茎：分布覆盖（400 男角色四档均出现，且镜像=档）', async () => {
    for (let i = 0; i < 400; i++) makeChar(`js_${i}`, { base: { 性别: 1 } })
    const seen = new Set<number>()
    for (let i = 0; i < 400; i++) {
      await call('body-shape', 'getPenisLength', `js_${i}`)
      const ch = entitySystem.get('character', `js_${i}`) as any
      const rank = ch.base['阴茎大小']
      seen.add(rank)
      const tier = ['短小', '普通', '粗大', '巨根'][rank]
      const v = ch.body_shape['阴茎长度']
      const expectRank = v >= 16 ? 3 : v >= 12 ? 2 : v >= 8 ? 1 : 0
      expect(rank).toBe(expectRank)
      void tier
    }
    for (const r of [0, 1, 2, 3]) expect(seen.has(r)).toBe(true)
  })

  it('阴茎：边界 8/12/16（min闭max开）+ 镜像同步 + jj_0~3 前提联动（h-ejaculation 读镜像）', async () => {
    makeChar('jb', { base: { 性别: 1 } })
    const cases = [[7.9, '短小', 0], [8, '普通', 1], [12, '粗大', 2], [16, '巨根', 3], [999, '巨根', 3]] as const
    for (const [cm, tier, rank] of cases) {
      await call('body-shape', 'setPenisLength', 'jb', cm)
      expect(await call('body-shape', 'getPenisTier', 'jb')).toBe(tier)
      const ch = entitySystem.get('character', 'jb') as any
      expect(ch.base['阴茎大小']).toBe(rank)             // 镜像同步
      for (let n = 0; n <= 3; n++) {
        const ctx = { player: null, location: null, time: { minute: 0, hour: 8, day: 1, month: 1, year: 1 }, selectedCharacterId: 'jb', sourceId: 'jb' } as any
        expect(conditionEngine.getPremiseValue(`jj_${n}`, ctx)).toBe(n === rank)
      }
    }
  })

  it('阴茎：显式作者档位 base.阴茎大小=3 → 巨根区间落 cm，镜像保持 3', async () => {
    makeChar('ja', { base: { 性别: 1, 阴茎大小: 3 } })
    const cm = await call('body-shape', 'getPenisLength', 'ja')
    expect(cm).toBeGreaterThanOrEqual(16)
    const ch = entitySystem.get('character', 'ja') as any
    expect(ch.base['阴茎大小']).toBe(3)
  })

  it('阴茎：代理域 body_shape.selected.阴茎长度 读时 reconcile（男真/女假）', async () => {
    makeChar('jp', { base: { 性别: 1 } })
    await call('body-shape', 'setPenisLength', 'jp', 18)
    const ctx = { player: null, location: null, time: { minute: 0, hour: 8, day: 1, month: 1, year: 1 }, selectedCharacterId: 'jp', getEntity: () => null } as any
    expect(conditionEngine.evaluate('body_shape.selected.阴茎长度 >= 16', ctx)).toBe(true)
    makeChar('jq')   // 女
    const ctx2 = { ...ctx, selectedCharacterId: 'jq' }
    expect(conditionEngine.evaluate('body_shape.selected.阴茎长度 >= 16', ctx2)).toBe(false)
  })

  it('阴茎：setPenisLength 发 character:changed', async () => {
    makeChar('jr', { base: { 性别: 1 } })
    let fired = 0
    const handler = () => { fired++ }
    eventBus.on('character:changed', handler)
    try {
      await call('body-shape', 'setPenisLength', 'jr', 10)
      expect(fired).toBe(1)
    } finally {
      eventBus.off('character:changed', handler)
    }
  })

  // ── 长大/缩小原语 adjust ──
  it('adjust：长大/缩小跨档边界，天赋互斥跟随（85→92 巨乳 / 92→88 普乳）', async () => {
    makeChar('k1', { body_shape: { 胸围: 85 } })
    expect(await call('body-shape', 'adjust', 'k1', 'bust', 7)).toBe(92)
    let ch = entitySystem.get('character', 'k1') as any
    expect(ch.talents['巨乳']).toBe(1)
    expect(ch.talents['普乳']).toBeUndefined()          // 旧天赋丧失
    expect(await call('body-shape', 'adjust', 'k1', 'bust', -4)).toBe(88)
    ch = entitySystem.get('character', 'k1') as any
    expect(ch.talents['普乳']).toBe(1)
    expect(ch.talents['巨乳']).toBeUndefined()          // 新天赋获得
  })

  it('adjust：硬 0 下限钳制（缩到负 → 停在 0；继续缩 = no-op 不发事件）', async () => {
    makeChar('k2', { body_shape: { 胸围: 2 } })
    expect(await call('body-shape', 'adjust', 'k2', 'bust', -5)).toBe(0)
    const ch = entitySystem.get('character', 'k2') as any
    expect(ch.body_shape['胸围']).toBe(0)
    let fired = 0
    const handler = () => { fired++ }
    eventBus.on('body-shape:adjusted', handler)
    try {
      expect(await call('body-shape', 'adjust', 'k2', 'bust', -3)).toBe(0)
      expect(fired).toBe(0)
    } finally {
      eventBus.off('body-shape:adjusted', handler)
    }
  })

  it('adjust：性别闸（男 adjust bust → null 零写入）+ 非法 dim → null', async () => {
    makeChar('k3', { base: { 性别: 1 } })
    expect(await call('body-shape', 'adjust', 'k3', 'bust', 10)).toBeNull()
    expect((entitySystem.get('character', 'k3') as any).body_shape?.['胸围']).toBeUndefined()
    makeChar('k4')
    expect(await call('body-shape', 'adjust', 'k4', 'waist', 10)).toBeNull()
  })

  it('adjust：阴茎 → 镜像 + jj 前提联动（11→13 跨档粗大）', async () => {
    makeChar('k5', { base: { 性别: 1 }, body_shape: { 阴茎长度: 11 } })
    expect(await call('body-shape', 'adjust', 'k5', 'penis', 2)).toBe(13)
    const ch = entitySystem.get('character', 'k5') as any
    expect(ch.base['阴茎大小']).toBe(2)   // 粗大
    for (let n = 0; n <= 3; n++) {
      const ctx = { player: null, location: null, time: { minute: 0, hour: 8, day: 1, month: 1, year: 1 }, selectedCharacterId: 'k5', sourceId: 'k5' } as any
      expect(conditionEngine.getPremiseValue(`jj_${n}`, ctx)).toBe(n === 2)
    }
  })

  it('adjust：body-shape:adjusted 载荷正确（旧/新/增量/档），character:changed 照发', async () => {
    makeChar('k6', { body_shape: { 胸围: 88 } })
    let adj: any = null
    const h1 = (p: any) => { adj = p }
    let cc = 0
    const h2 = () => { cc++ }
    eventBus.on('body-shape:adjusted', h1)
    eventBus.on('character:changed', h2)
    try {
      expect(await call('body-shape', 'adjust', 'k6', 'bust', 5)).toBe(93)
    } finally {
      eventBus.off('body-shape:adjusted', h1)
      eventBus.off('character:changed', h2)
    }
    expect(adj).toMatchObject({ id: 'k6', dim: 'bust', delta: 5, old: 88, value: 93, tier: '巨乳' })
    expect(cc).toBe(1)
  })

  it('adjust：未消费角色先懒物化再改（[巨乳]女孩 adjust +1 → 91cm）', async () => {
    makeChar('k7', { talents: { 巨乳: 1 } })
    expect(await call('body-shape', 'adjust', 'k7', 'bust', 1)).toBe(91)
    const ch = entitySystem.get('character', 'k7') as any
    expect(ch.body_shape['胸围']).toBe(91)
    expect(ch.talents['巨乳']).toBe(1)
  })
})
