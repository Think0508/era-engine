// ADR 0018——行为轨整体修饰字段（style/trigger/display/speed/pause/color/size/font）
// engine 级测试（不经插件管线，避免加载全量口上数据）：
//   - normalizeCommonTextEntry 白名单透传 + 未知键丢弃 + 幂等
//   - getTextEntry 返回 { text, display }；getText 仍为纯文本视图
//   - parts 组合词条：display 取 A 段被选条目
import { describe, expect, it } from 'vitest'
import {
  CommonTextsEngine,
  normalizeCommonTextEntry,
  type VariableData,
} from './talk-common-system/engine'

describe('normalizeCommonTextEntry 展示字段', () => {
  it('白名单透传 + 未知键丢弃 + 幂等短路', () => {
    const n = normalizeCommonTextEntry({
      context: 'x',
      conditions: 'premise(high_1)',
      style: 'narrator',
      trigger: 'click',
      display: 'typewriter',
      speed: 40,
      pause: 500,
      color: '#80FF0000',
      size: 'large',
      font: '楷体',
      foo: 'bar', // 未知键必须丢弃
    } as never)
    expect(n.style).toBe('narrator')
    expect(n.trigger).toBe('click')
    expect(n.display).toBe('typewriter')
    expect(n.speed).toBe(40)
    expect(n.pause).toBe(500)
    expect(n.color).toBe('#80FF0000')
    expect(n.size).toBe('large')
    expect(n.font).toBe('楷体')
    expect((n as unknown as Record<string, unknown>).foo).toBeUndefined()

    // 幂等：归一化产物再归一化 = 同一对象（缓存路径别名）
    const again = normalizeCommonTextEntry(n as never)
    expect(again).toBe(n)
  })

  it('无展示字段的条目不受影响', () => {
    const n = normalizeCommonTextEntry({ context: 'x' } as never)
    expect(n.style).toBeUndefined()
    expect(n.speed).toBeUndefined()
  })
})

describe('getTextEntry', () => {
  it('普通词条：文本 + 选中条目的 display（确定性——单条目候选，2026-08-25 修硬币测试）', () => {
    const eng = new CommonTextsEngine()
    const data: VariableData = {
      chat: {
        parts: [],
        description: '',
        entries: [
          { context: '带样式的那条', style: 'narrator', trigger: 'click', speed: 40 },
        ],
      },
    }
    eng.loadFromData(data, {})
    const r = eng.getTextEntry('chat', null)
    expect(r?.text).toBe('带样式的那条')
    // 选中条目 display 字段完整透传
    expect(r!.display).toBeDefined()
    expect(r!.display?.style).toBe('narrator')
    expect(r!.display?.trigger).toBe('click')
    expect(r!.display?.speed).toBe(40)

    // 兼容视图：getText 只给文本
    const t = eng.getText('chat', null)
    expect(t).toBe('带样式的那条')
  })

  it('无样式条目：display 为空对象（defined 但无字段），不抛（确定性）', () => {
    const eng = new CommonTextsEngine()
    const data: VariableData = {
      chat: {
        parts: [],
        description: '',
        entries: [{ context: '普通条' }],
      },
    }
    eng.loadFromData(data, {})
    const r = eng.getTextEntry('chat', null)
    expect(r?.text).toBe('普通条')
    expect(r!.display).toBeDefined()
    expect(r!.display?.style).toBeUndefined()
  })

  it('display 白名单净化：不透传 context/conditions/premiseRefs 等运行态键（防污染补位 line）', () => {
    const eng = new CommonTextsEngine()
    const data: VariableData = {
      chat: {
        parts: [],
        description: '',
        entries: [
          { context: '甲', style: 'narrator', speed: 60 },
          { context: '乙' },
        ],
      },
    }
    eng.loadFromData(data, {})
    const r = eng.getTextEntry('chat', null)
    const keys = r!.display ? Object.keys(r!.display) : []
    expect(keys).not.toContain('context')
    expect(keys).not.toContain('conditions')
    expect(keys).not.toContain('premiseRefs')
    expect(keys).not.toContain('hasUnconsciousRef')
    expect(keys).not.toContain('part')
    for (const k of keys) {
      expect(['style', 'trigger', 'display', 'speed', 'pause', 'color', 'size', 'font']).toContain(k)
    }
  })

  it('parts 组合词条：display 取 A 段被选条目，其余段忽略', () => {
    const eng = new CommonTextsEngine()
    const data: VariableData = {
      vagina_s: {
        parts: ['A', 'B'],
        description: '',
        entries: [
          { context: '短词A', part: 'A', color: '#80FF0000' },
          { context: '短词B', part: 'B' },
        ],
      },
    }
    eng.loadFromData(data, {})
    const r = eng.getTextEntry('vagina_s', null)
    expect(r?.text).toBe('短词A短词B')
    expect(r?.display?.color).toBe('#80FF0000')
  })

  it('空池/未知名返回 null', () => {
    const eng = new CommonTextsEngine()
    eng.loadFromData({ chat: { parts: [], description: '', entries: [] } }, {})
    expect(eng.getTextEntry('chat', null)).toBeNull()
    expect(eng.getTextEntry('nope', null)).toBeNull()
    expect(eng.getText('nope', null)).toBeNull()
  })
})