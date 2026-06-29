import { describe, it, expect, beforeEach } from 'vitest'
import { NarrativeLog } from './narrative-log'

describe('narrative-log', () => {
  let log: NarrativeLog

  beforeEach(() => {
    log = new NarrativeLog(100)
  })

  it('write 返回 entry id 且可读取', () => {
    const id = log.write('测试文本', 'system', 'test')
    expect(id).toBeDefined()
    const entries = log.getEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0].text).toBe('测试文本')
    expect(entries[0].type).toBe('system')
    expect(entries[0].source).toBe('test')
  })

  it('write 多条生成唯一 id', () => {
    const id1 = log.write('第一条', 'system')
    const id2 = log.write('第二条', 'dialogue')
    expect(id1).not.toBe(id2)
    expect(log.getEntries()).toHaveLength(2)
  })

  it('超过 limit 淘汰最旧', () => {
    for (let i = 0; i < 105; i++) {
      log.write(`line ${i}`, 'system')
    }
    expect(log.length).toBe(100)
    // 注释：最旧的 5 条被淘汰
    const entries = log.getEntries()
    expect(entries[0].text).toBe('line 5')
    expect(entries[99].text).toBe('line 104')
  })

  it('markConsumed 标记 interactive entry', () => {
    const id = log.write('地图', 'map', 'map-system', true, { location: 'town' })
    expect(log.getEntries()[0].consumed).toBeUndefined()
    log.markConsumed(id)
    expect(log.getEntries()[0].consumed).toBe(true)
  })

  it('markConsumed 不存在的 id 不报错', () => {
    expect(() => log.markConsumed('nonexistent')).not.toThrow()
  })

  it('clear 清空', () => {
    log.write('a', 'system')
    log.write('b', 'dialogue')
    log.clear()
    expect(log.length).toBe(0)
  })

  it('interactive + payload 正确存储', () => {
    log.write('选择', 'choice', 'dialogue-system', true, {
      choices: [{ text: '选项A', next: 'a' }, { text: '选项B', next: 'b' }],
    })
    const entry = log.getEntries()[0]
    expect(entry.interactive).toBe(true)
    expect(entry.payload.choices).toHaveLength(2)
  })
})
