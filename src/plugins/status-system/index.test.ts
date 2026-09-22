// 注释：status-system 计划三测试——expiresAt 迁移 + 层数三层模型 + 属性修正生灭
// 覆盖：①属性修正不碰基础值（本设计第一验收点）②绝对时刻到期 ③「打到几」/「加几」两类运算
// ④stack_decay 衰减 ⑤护体 −1 层（含来源到期即撤销）⑥旧档就地迁移（幂等、不丢条目）
// ⑦存档往返（JSON 整对象序列化）⑧apply_status effect 参数与 status API 表
//
// boot 模式（参照 h-time-stop.test.ts）：mod 用**单例** modLoader.loadMod('test-mod')——
// applyStatus 走 modLoader.getMod()，且属性有效值层的属性定义注入与**惰性游戏时钟**注入
// 都在 loadMod 里（parseModData 不经这段注入 → 运行时修正会静默不过期）。
// onLoad/onEnable 各调一次（effectTypeRegistry/apiSystem 重复注册抛错），故放 beforeAll。

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { modLoader } from '../../core/mod-loader'
import { entitySystem } from '../../core/entity-system'
import { gameContext, gameTimeToTotalMinutes } from '../../core/game-context'
import { eventBus } from '../../core/event-bus'
import { apiSystem } from '../../core/api'
import { errorReporter } from '../../core/error-reporter'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { getEntityAttr, readRawAttr } from '../../core/entity-utils'
import { onLoad as effectOnLoad, onEnable as effectOnEnable } from '../effect-system/index'
import { onLoad, onEnable, applyStatus, removeStatus, effectiveStack } from './index'

const stubCtx: any = {
  api: apiSystem,
  events: eventBus,
  ui: { registerSlot: () => {} },
  commands: { register: () => {} },
}

function player(): any { return entitySystem.get('character', 'player') as any }

function entryOf(charId: string, statusId: string): any {
  return (entitySystem.get('character', charId) as any)?.status_effects?.find((s: any) => s.id === statusId)
}

/** 当前游戏分钟（与 status-system 同一算式：跨年月日累计） */
function nowMin(): number { return gameTimeToTotalMinutes(gameContext.getContext().time) }

function setTime(hour: number, minute = 0): void {
  gameContext.setTime({ minute, hour, day: 1, month: 1, year: 1 })
}

/** on_apply/on_remove_effects 是 fire-and-forget 的异步链——等一个宏任务让其落定 */
async function flushEffects(): Promise<void> { await new Promise(resolve => setTimeout(resolve, 0)) }

describe('status-system —— expiresAt + 层数三层模型 + 属性修正生灭（计划三）', () => {
  beforeAll(async () => {
    entitySystem.clear()
    errorReporter.clear()
    await modLoader.loadMod('test-mod')
    // 注释：非属性 on_apply/on_remove_effects 探针要走 effect-system.execute（真实链路）
    effectOnLoad(stubCtx)
    effectOnEnable(stubCtx)
    onLoad(stubCtx)
    onEnable(stubCtx)
  })

  beforeEach(() => {
    errorReporter.clear()
    // 注释：每条用例从 mod 初始模板深拷贝一个干净玩家（status_effects/attr_mods 清空）
    const fresh = JSON.parse(JSON.stringify(modLoader.getMod()!.entities.get('character')!.get('player')))
    entitySystem.unregister('character', 'player')
    entitySystem.register('character', 'player', fresh)
    setTime(8)
  })

  // ── 属性修正生灭（运行时来源）────────────────────────────────────────────
  it('属性修正不污染基础值：生效期间有效值 +25，readRawAttr 分毫不动，移除后回落', () => {
    const p = player()
    const before = getEntityAttr(p, '修正测试值')
    const rawBefore = readRawAttr(p, '修正测试值')

    applyStatus('player', '修正测试状态')
    expect(getEntityAttr(p, '修正测试值')).toBe(before + 25)   // 100 + 25
    expect(readRawAttr(p, '修正测试值')).toBe(rawBefore)        // 基础值分毫不动（spec §2.1 的雷）

    removeStatus('player', '修正测试状态')
    expect(getEntityAttr(p, '修正测试值')).toBe(before)         // 100
    expect(p.attr_mods).toEqual([])                            // 修正条目一并撤销，不留残骸
  })

  it('到期：按绝对时刻失效（时间跳跃也正确，不靠逐次扣时长）', () => {
    const p = player()
    applyStatus('player', '修正测试状态')                      // duration = 120 → expiresAt = 480 + 120
    expect(entryOf('player', '修正测试状态').expiresAt).toBe(nowMin() + 120)
    expect(getEntityAttr(p, '修正测试值')).toBe(125)

    setTime(10)                                                // 跳到 600 = expiresAt（now >= expiresAt 即失效）
    expect(getEntityAttr(p, '修正测试值')).toBe(100)
    expect(p.attr_mods).toEqual([])                            // 过期条目被就地剪除
  })

  // ── 层数三层模型（基础层数 + 层数修正 − 衰减）────────────────────────────
  it('层数三层模型：基础层数 3 + 护体 −1 = 2；移除护体后回到 3（基础层数分毫不动）', () => {
    applyStatus('player', '修正测试层数', { stack: 3 })
    expect(entryOf('player', '修正测试层数').base_stack).toBe(3)

    applyStatus('player', '修正测试护体')
    expect(effectiveStack('player', '修正测试层数')).toBe(2)    // 3 − 1（护体挂上来的层数修正）
    expect(entryOf('player', '修正测试层数').base_stack).toBe(3) // 基础层数不受修正影响
    expect(entryOf('player', '修正测试层数').stack).toBe(2)      // 兼容视图 stack = 有效层数（spec §9）

    removeStatus('player', '修正测试护体')
    expect(effectiveStack('player', '修正测试层数')).toBe(3)    // 基础层数分毫不动
    expect(entryOf('player', '修正测试层数').stack_mods).toEqual([])
  })

  it('D5：打到 2 打不动已有的 3 —— 层数与周期都不变', () => {
    applyStatus('player', '修正测试层数', { stack: 3 })
    const expiresBefore = entryOf('player', '修正测试层数').expiresAt
    setTime(9)                                                 // 推进 60 分钟（"刷新时长"才可观测）
    applyStatus('player', '修正测试层数', { stack: 2 })
    expect(entryOf('player', '修正测试层数').base_stack).toBe(3)
    expect(entryOf('player', '修正测试层数').expiresAt).toBe(expiresBefore)
  })

  it('加层：打到 1 + 加 3 = 4（加法类不受顶替判定约束）', () => {
    applyStatus('player', '修正测试层数', { stack: 1 })
    applyStatus('player', '修正测试层数', { stack_add: 3 })
    expect(effectiveStack('player', '修正测试层数')).toBe(4)
    expect(entryOf('player', '修正测试层数').base_stack).toBe(4)
  })

  it('衰减：每 60 分钟 −1 层（stack_decay），到 0 有效层数为 0', () => {
    applyStatus('player', '修正测试层数', { stack: 2 })        // duration=600, decay 60/1
    setTime(9)
    expect(effectiveStack('player', '修正测试层数')).toBe(1)
    setTime(10)
    expect(effectiveStack('player', '修正测试层数')).toBe(0)
  })

  it('【第一验收点】攻击增益：生效期间 attack 有效值 +10，基础值不动，到期后回落', () => {
    const p = player()
    const rawBefore = readRawAttr(p, 'attack')                 // 绑定键，base 域
    const effBefore = getEntityAttr(p, 'attack')

    applyStatus('player', '攻击增益')                           // 迁移后 = attribute_mods [{ attr='attack', flat=10 }]
    expect(getEntityAttr(p, 'attack')).toBe(effBefore + 10)
    expect(readRawAttr(p, 'attack')).toBe(rawBefore)            // ← 对照 spec §2.1 的雷：基础值必须分毫不动

    setTime(12)                                                // 越过 180 分钟（expiresAt = 480 + 180 = 660）
    expect(getEntityAttr(p, 'attack')).toBe(effBefore)
    expect(readRawAttr(p, 'attack')).toBe(rawBefore)
  })

  // ── 旧档就地迁移 + 存档往返 ─────────────────────────────────────────────
  it('旧档就地迁移：remaining_duration → expiresAt（幂等、不丢条目、不立即 tick/decay）', () => {
    const p = player()
    const t0 = nowMin()                                        // 480
    // 旧档形态：只有 remaining_duration/stack（无 base_stack/expiresAt/last_decay_at）
    p.status_effects = [{ id: '修正测试层数', remaining_duration: 300, stack: 4, last_tick_game_time: 0 }]
    // 永久条目（remaining_duration = -1）
    p.status_effects.push({ id: '中毒', remaining_duration: -1, stack: 1, last_tick_game_time: 0 })

    expect(effectiveStack('player', '修正测试层数')).toBe(4)    // 读 = 首触 → 就地迁移

    const e = entryOf('player', '修正测试层数')
    expect(e.base_stack).toBe(4)                               // 旧 stack → base_stack
    expect(e.expiresAt).toBe(t0 + 300)                         // 旧 remaining_duration → 绝对时刻
    expect(e.last_decay_at).toBe(t0)                           // 不立即衰减爆发
    expect(e.last_tick_game_time).toBe(t0)                     // 不立即 tick 爆发
    expect(e.stack_mods).toEqual([])
    expect(Object.keys(e)).not.toContain('remaining_duration') // 旧字段不再作为数据留在档里
    expect(entryOf('player', '中毒').expiresAt).toBeUndefined() // -1 → 永久（无到期时刻）
    expect(p.status_effects).toHaveLength(2)                   // 条目一个不丢

    // 幂等：时间推进后再读 → 不二次换算（仍是 t0 + 300），衰减从迁移时刻起算
    setTime(9)
    expect(effectiveStack('player', '修正测试层数')).toBe(3)    // 迁移后满 60 分钟 → 衰减 1 层
    expect(entryOf('player', '修正测试层数').expiresAt).toBe(t0 + 300)

    // 永久条目：跳一年也还在
    setTime(8)
    gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 3 })
    expect(effectiveStack('player', '中毒')).toBe(1)
  })

  it('来源到期即撤销层数修正（不是只有手动移除才撤销）', async () => {
    applyStatus('player', '修正测试层数', { stack: 5 })
    applyStatus('player', '修正测试护体')                        // duration 120 → expiresAt 600
    expect(effectiveStack('player', '修正测试层数')).toBe(4)     // 5 − 1

    setTime(10)                                                // 600 = 护体到期时刻
    await eventBus.emit('game:hour_changed', { hour: 10, minute: 0 })
    expect(entryOf('player', '修正测试护体')).toBeUndefined()    // 到期 → 整条移除
    expect(entryOf('player', '修正测试层数').stack_mods).toEqual([]) // 它给出的 −1 被撤销
    // 5 − 2（480→540→600 两次衰减）；若护体的 −1 未被撤销 → 2（假绿会差 1 层）
    expect(effectiveStack('player', '修正测试层数')).toBe(3)
    expect(entryOf('player', '修正测试层数').base_stack).toBe(3)
  })

  it('存档往返：状态/层数/层数修正/属性修正与到期时刻随角色整体序列化保留', async () => {
    applyStatus('player', '修正测试层数', { stack: 3 })
    applyStatus('player', '修正测试护体')                        // 层数 −1（挂在 层数 条目上）
    applyStatus('player', '攻击增益')                            // attr_mods: status:攻击增益 → attack +10
    const effBefore = getEntityAttr(player(), 'attack')
    const rawBefore = readRawAttr(player(), 'attack')
    expect(effectiveStack('player', '修正测试层数')).toBe(2)

    // save-system 就是 JSON.parse(JSON.stringify(char)) 整对象序列化（save-system.ts:181）
    const saved = JSON.parse(JSON.stringify(player()))
    expect(saved.status_effects.every((s: any) => !('remaining_duration' in s))).toBe(true) // 兼容视图不入档
    expect(saved.attr_mods).toHaveLength(1)                                              // 属性修正随档走
    entitySystem.unregister('character', 'player')
    entitySystem.register('character', 'player', saved)
    await eventBus.emit('game:load', {})                         // 读档广播 → 条目归一化（视图重装）

    expect(effectiveStack('player', '修正测试层数')).toBe(2)     // 基础层数 3 + 护体 −1
    expect(entryOf('player', '修正测试层数').base_stack).toBe(3)
    expect(entryOf('player', '修正测试层数').stack_mods).toHaveLength(1)
    expect(entryOf('player', '修正测试护体').remaining_duration).toBe(120)
    expect(getEntityAttr(player(), 'attack')).toBe(effBefore)    // 属性修正随档保留
    expect(readRawAttr(player(), 'attack')).toBe(rawBefore)      // 基础值仍是裸值

    // 到期时刻随档保留 → 到点仍失效（不是"读档后变永久"）
    setTime(12)                                                  // 越过攻击增益 660
    expect(getEntityAttr(player(), 'attack')).toBe(rawBefore)
  })

  // ── effect 参数 + API 表 ───────────────────────────────────────────────
  it('apply_status effect：stack 与 stack_add 同给 → warning + 忽略 stack_add', async () => {
    const handler = effectTypeRegistry.getHandler('apply_status')!
    await handler({ status: '修正测试层数', stack: 3, stack_add: 5 }, { _targetIds: ['player'] })
    expect(entryOf('player', '修正测试层数').base_stack).toBe(3) // 「打到 3」生效
    expect(effectiveStack('player', '修正测试层数')).toBe(3)     // stack_add 被忽略（否则 8）
    expect(errorReporter.getErrors().some(e => e.severity === 'warning' && e.message.includes('stack_add'))).toBe(true)

    await handler({ status: '修正测试层数', stack_add: 3 }, { _targetIds: ['player'] })
    expect(effectiveStack('player', '修正测试层数')).toBe(6)     // 单独 stack_add：3 + 3
  })

  it('status API 表暴露 effectiveStack / 有效层数语义（条件/口上/其他插件入口）', async () => {
    applyStatus('player', '修正测试层数', { stack: 3 })
    applyStatus('player', '修正测试护体')
    expect(await apiSystem.call('status', 'effectiveStack', 'player', '修正测试层数')).toBe(2)
    expect(await apiSystem.call('status', 'getStack', 'player', '修正测试层数')).toBe(2)   // 有效层数（含护体 −1）
    expect(await apiSystem.call('status', 'hasStatus', 'player', '修正测试护体')).toBe(true)
    expect(await apiSystem.call('status', 'getRemaining', 'player', '修正测试护体')).toBe(120)

    await apiSystem.call('status', 'apply', 'player', '修正测试状态')
    expect(getEntityAttr(player(), '修正测试值')).toBe(125)      // apply 走同一条施加路径
    await apiSystem.call('status', 'remove', 'player', '修正测试状态')
    expect(getEntityAttr(player(), '修正测试值')).toBe(100)
  })

  it('on_apply_effects / on_remove_effects 机制保留（仅限非属性效果）', async () => {
    const mod = modLoader.getMod()!
    const seen: string[] = []
    effectTypeRegistry.register('probe_status_effect', (params: any) => { seen.push(String(params.tag)); return true })
    mod.statusEffects['probe_status'] = {
      id: 'probe_status', name: '探针', description: '', category: 'neutral',
      duration: 60, tick_interval: 0, stackable: false, max_stack: 1,
      on_apply_effects: [{ type: 'probe_status_effect', params: { tag: 'apply' } }],
      on_remove_effects: [{ type: 'probe_status_effect', params: { tag: 'remove' } }],
    }
    try {
      applyStatus('player', 'probe_status')
      await flushEffects()
      expect(seen).toEqual(['apply'])
      removeStatus('player', 'probe_status')
      await flushEffects()
      expect(seen).toEqual(['apply', 'remove'])
    } finally {
      delete mod.statusEffects['probe_status']
    }
  })

  it('缺失状态定义：warning 且不改动角色（不静默造出幽灵状态）', () => {
    applyStatus('player', 'no_such_status')
    expect(player().status_effects ?? []).toHaveLength(0)
    expect(errorReporter.getErrors().some(e => e.severity === 'warning' && e.message.includes('no_such_status'))).toBe(true)
  })

  // ── 审查修复（2026-09-22）：待衰减对账 + 死条目不应答查找 ──────────────────
  it('「打到 N」先把待衰减落账：顶上后有效层数 == N，且下次结算不会把刚施加的状态删掉', async () => {
    applyStatus('player', '修正测试层数', { stack: 1 })        // 8:00 → base 1、锚点 8:00
    setTime(9, 30)                                             // 已过 60 分钟（待衰减 1，尚未结算）
    expect(effectiveStack('player', '修正测试层数')).toBe(0)    // 投影：1 − 1

    applyStatus('player', '修正测试层数', { stack: 1 })         // 打到 1（1 > 0 → 顶上）
    // 修前：直接写 base_stack = 1 而不管待衰减、锚点仍是 8:00 → 有效层数 0，
    //       下一次结算按陈旧锚点扣到 0 → 刚施加的状态被自己删掉
    expect(entryOf('player', '修正测试层数').base_stack).toBe(1)
    expect(entryOf('player', '修正测试层数').last_decay_at).toBe(nowMin())  // 锚点重置到"现在"
    expect(effectiveStack('player', '修正测试层数')).toBe(1)     // 有效层数 == 目标层数

    setTime(10)                                                // 结算（hour_changed）
    await eventBus.emit('game:hour_changed', { hour: 10, minute: 0 })
    expect(entryOf('player', '修正测试层数')).toBeDefined()      // 状态仍在（没被自己删掉）
    expect(effectiveStack('player', '修正测试层数')).toBe(1)
  })

  it('顶上的属性修正到期时刻跟随状态（强度不降级：衰减后再顶上不会让 buff 先过期）', () => {
    const mod = modLoader.getMod()!
    // 同时有层数概念（会衰减）与属性修正的状态——衰减会让"新算出的强度"低于已存条目强度
    mod.statusEffects['probe_decay_attr'] = {
      id: 'probe_decay_attr', name: 'probe', description: '', category: 'buff',
      duration: 600, tick_interval: 0, stackable: false, max_stack: 10,
      stack_decay: { every: 60, amount: 1 },
      attribute_mods: [{ attr: '修正测试值', flat: 5 }],
    }
    try {
      applyStatus('player', 'probe_decay_attr', { stack: 5 })   // 8:00 → 强度 5、到期 1080
      const p = player()
      const modId = 'status:probe_decay_attr'
      expect(p.attr_mods.find((m: any) => m.id === modId)?.strength).toBe(5)
      expect(getEntityAttr(p, '修正测试值')).toBe(105)

      setTime(10, 30)                                            // 待衰减 2 → 有效 3
      applyStatus('player', 'probe_decay_attr', { stack: 4 })    // 4 > 3 → 顶上（新强度 4 < 已存 5）
      const entry = entryOf('player', 'probe_decay_attr')
      expect(entry.expiresAt).toBe(nowMin() + 600)               // 状态时长刷新到 1170
      // 修前：强度 4 < 已存 5 → registerRuntimeMod 按 D5 拒绝 → 属性修正保留旧到期时刻 1080
      //       = buff 的属性效果比状态本身先过期 90 分钟
      expect(p.attr_mods.find((m: any) => m.id === modId)?.expiresAt).toBe(entry.expiresAt)
      expect(p.attr_mods.find((m: any) => m.id === modId)?.strength).toBe(5) // 强度不降级（D5）
    } finally {
      delete mod.statusEffects['probe_decay_attr']
    }
  })

  it('已过期未落账的条目不应答查找：三处答案一致，且不让新的较低层数施加静默无效', async () => {
    const mod = modLoader.getMod()!
    // 无衰减的状态：死后层数不会被投影抹平，最能暴露"死条目挡住新施加"
    mod.statusEffects['probe_plain_stack'] = {
      id: 'probe_plain_stack', name: 'probe', description: '', category: 'debuff',
      duration: 60, tick_interval: 0, stackable: false, max_stack: 10,
    }
    try {
      applyStatus('player', 'probe_plain_stack', { stack: 5 })   // 8:00 → 到期 9:00
      setTime(9, 30)                                             // 越过到期时刻；**不发** hour_changed（这就是窗口）
      const { conditionEngine } = await import('../../core/condition-engine')
      const ctx = { ...gameContext.getContext(), selectedCharacterId: 'player' }

      // ① 死条目不得让新的较低层数施加静默无效
      applyStatus('player', 'probe_plain_stack', { stack: 2 })
      // 修前：死条目（5 层）被当成 existing → 2 > 5 不成立 → 静默 no-op，状态仍是死的 5 层
      expect(entryOf('player', 'probe_plain_stack').base_stack).toBe(2)
      expect(entryOf('player', 'probe_plain_stack').expiresAt).toBe(nowMin() + 60) // 全新条目（不是死条目的 9:00）
      expect(player().status_effects.filter((s: any) => s.id === 'probe_plain_stack')).toHaveLength(1) // 死条目已被剪除
      // ② 同一时刻三处答案一致（活着）
      expect(await apiSystem.call('status', 'hasStatus', 'player', 'probe_plain_stack')).toBe(true)
      expect(await apiSystem.call('status', 'getStack', 'player', 'probe_plain_stack')).toBe(2)
      expect(conditionEngine.evaluate('selected.status.probe_plain_stack == true', ctx)).toBe(true)

      // ③ 再让它过期（同样不发结算）：第一次触碰即剪除死条目 → 三处一致地"没有这个状态"
      setTime(12)                                                // 越过新条目的 10:30
      expect(await apiSystem.call('status', 'getStack', 'player', 'probe_plain_stack')).toBe(0)
      expect(await apiSystem.call('status', 'hasStatus', 'player', 'probe_plain_stack')).toBe(false)
      expect(player().status_effects.some((s: any) => s.id === 'probe_plain_stack')).toBe(false) // 原始数组也干净
      expect(conditionEngine.evaluate('selected.status.probe_plain_stack == true', ctx)).toBe(false)
    } finally {
      delete mod.statusEffects['probe_plain_stack']
    }
  })

  it('expiresAt 卫生：非有限数字 → 去重上报 error，并按"不自动到期"处理（不静默变永久、视图不返 NaN）', () => {
    const p = player()
    // 手改档/旧格式：expiresAt 写成了字符串
    p.status_effects = [{
      id: '醉意', base_stack: 2, expiresAt: 'abc',
      stack_mods: [], last_decay_at: 0, last_tick_game_time: 0,
    }]
    expect(effectiveStack('player', '醉意')).toBe(2)             // 触碰 → 归一化 + 上报
    const errs = errorReporter.getErrors().filter(e => e.source === 'status-system' && e.message.includes('expiresAt'))
    expect(errs).toHaveLength(1)
    expect(errs[0].severity).toBe('error')
    expect(errs[0].message.includes('醉意')).toBe(true)
    expect(entryOf('player', '醉意').remaining_duration).toBe(-1) // 视图给 -1（不是 NaN）
    setTime(23)                                                  // 跳很远也不失效——但**有 error 留痕**，不是静默
    expect(effectiveStack('player', '醉意')).toBe(2)
  })

  it('兼容视图的 setter 落回唯一真值：写 stack → base_stack；写 remaining_duration → expiresAt', () => {
    applyStatus('player', '修正测试层数', { stack: 3 })
    applyStatus('player', '修正测试护体')
    const e = entryOf('player', '修正测试层数')
    expect(e.stack).toBe(2)                                      // 读：有效层数（含护体 −1）
    e.stack = 6                                                  // 写：旧拼写的写入方不静默失效
    expect(e.base_stack).toBe(6)
    expect(effectiveStack('player', '修正测试层数')).toBe(5)     // 6 − 1

    const prot = entryOf('player', '修正测试护体')
    expect(prot.remaining_duration).toBe(120)                    // 读：剩余分钟（由 expiresAt 推导）
    prot.remaining_duration = 30                                 // 写：分钟数换算成绝对时刻
    const absolute = nowMin() + 30                               // 8:00 + 30 分钟
    expect(prot.expiresAt).toBe(absolute)
    setTime(9)
    expect(entryOf('player', '修正测试护体').remaining_duration).toBe(0)  // 推导值随时间走
    expect(entryOf('player', '修正测试护体').expiresAt).toBe(absolute)    // 真值不动
  })

  // ── 条件路径的既有消费者（字段改名的静默回归防线）──────────────────────────
  it('条件路径兼容：状态存在性 / 条目形状检查 / .stack（有效层数）/ .remaining（剩余分钟）', async () => {
    const mod = modLoader.getMod()!
    // 注入一条 ASCII id 的层数修正来源（层数条件用已定义状态名 醉意，避免扫描器判"未定义名"）
    mod.statusEffects['probe_stack_minus'] = {
      id: 'probe_stack_minus', name: 'probe', description: '', category: 'neutral',
      duration: 120, tick_interval: 0, stackable: false, max_stack: 1,
      stack_mods: [{ status: '醉意', value: -1 }],
    }
    try {
      applyStatus('player', '醉意', { stack: 3 })
      applyStatus('player', 'probe_stack_minus')
      const { conditionEngine } = await import('../../core/condition-engine')
      const ctx = { ...gameContext.getContext(), selectedCharacterId: 'player' }
      // ① 存在性（数组按 id 判定，condition-engine.ts:420）
      expect(conditionEngine.evaluate('selected.status.醉意 == true', ctx)).toBe(true)
      expect(conditionEngine.evaluate('selected.status.no_such_status == true', ctx)).toBe(false)
      // ①b 条目形状检查（condition-engine.ts:459 `'remaining_duration' in entry && 'stack' in entry`）
      //     判定式直接核对 + 走对象形态状态表（旧式 char.status）真实求值一次
      const entry = entryOf('player', '醉意')
      expect('remaining_duration' in entry && 'stack' in entry).toBe(true)
      const p = player()
      p.status = { 醉意: entry }
      expect(conditionEngine.evaluate('selected.status.醉意 == true', ctx)).toBe(true)
      delete p.status
      // ② .stack = **有效层数**（含层数修正；spec §9「层数条件看有效层数」）
      expect(conditionEngine.evaluate('selected.status.醉意.stack == 2', ctx)).toBe(true)
      expect(conditionEngine.evaluate('selected.status.醉意.stack >= 3', ctx)).toBe(false)
      expect(conditionEngine.evaluate('selected.status_effects.0.stack == 2', ctx)).toBe(true)
      // ③ .remaining = 剩余分钟（别名 remaining → remaining_duration；永久状态 = -1）
      expect(conditionEngine.evaluate('selected.status.醉意.remaining == 120', ctx)).toBe(true)
      setTime(9)
      expect(conditionEngine.evaluate('selected.status.醉意.remaining == 60', ctx)).toBe(true)
    } finally {
      delete mod.statusEffects['probe_stack_minus']
    }
  })
})
