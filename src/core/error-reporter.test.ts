// 注释：error-reporter 订阅机制测试（2026-08-12 round 13——UI 游戏内警告接线）
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { errorReporter } from './error-reporter'

describe('error-reporter 订阅', () => {
  beforeEach(() => errorReporter.clear())

  it('report 通知订阅者（error + warning 都通知）', () => {
    const cb = vi.fn()
    const unsub = errorReporter.onReport(cb)
    errorReporter.report({ source: 'test', severity: 'error', message: 'boom' })
    errorReporter.report({ source: 'test', severity: 'warning', message: 'warn' })
    expect(cb).toHaveBeenCalledTimes(2)
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', message: 'boom' }))
    unsub()
  })

  it('退订后不再通知', () => {
    const cb = vi.fn()
    const unsub = errorReporter.onReport(cb)
    unsub()
    errorReporter.report({ source: 'test', severity: 'error', message: 'x' })
    expect(cb).not.toHaveBeenCalled()
  })

  it('订阅者抛错不影响上报本身与其他订阅者', () => {
    const bad = vi.fn(() => { throw new Error('subscriber crashed') })
    const good = vi.fn()
    errorReporter.onReport(bad)
    errorReporter.onReport(good)
    expect(() => errorReporter.report({ source: 'test', severity: 'error', message: 'y' })).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
  })

  it('getErrors 返回拷贝、getErrorsBySource 过滤', () => {
    errorReporter.report({ source: 'a', severity: 'error', message: '1' })
    errorReporter.report({ source: 'b', severity: 'warning', message: '2' })
    const snap = errorReporter.getErrors()
    snap.push({ source: 'x', severity: 'error', message: '3' })
    expect(errorReporter.getErrors()).toHaveLength(2)
    expect(errorReporter.getErrorsBySource('a')).toHaveLength(1)
    // 修改过滤结果不影响内部（返回拷贝）
    const bySource = errorReporter.getErrorsBySource('a')
    bySource[0].message = 'hacked'
    expect(errorReporter.getErrorsBySource('a')[0].message).toBe('1')
  })
})
