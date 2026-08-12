import { conditionEngine } from '../../core/condition-engine'
import { describe, it, expect, beforeEach } from 'vitest'
import { CommonTextsEngine, type VariableData } from './engine'

// 注册测试用的前提 handler
function registerTestPremises() {
  conditionEngine.registerPremise('high_1', () => true)
  conditionEngine.registerPremise('sys_0', () => true)
}

describe('CommonTextsEngine', () => {
  let engine: CommonTextsEngine

  const defaultData: VariableData = {
    vagina: {
      parts: [],
      description: '阴道描述',
      entries: [
        { context: '湿滑的{vagina_s}', conditions: 'premise(high_1)' },
        { context: '粉嫩的{vagina_s}', conditions: 'premise(high_1)' },
      ],
    },
    penis: {
      parts: [],
      description: '阴茎描述',
      entries: [
        { context: '粗大的肉棒', conditions: 'premise(high_1)' },
        { context: '坚挺的性器', conditions: 'premise(high_1)' },
      ],
    },
    vagina_s: {
      parts: ['A', 'B'],
      description: '阴道短词',
      entries: [
        { part: 'A', context: '温热的', conditions: 'premise(high_1)' },
        { part: 'A', context: '湿润的', conditions: 'premise(high_1)' },
        { part: 'B', context: '小穴', conditions: 'premise(high_1)' },
        { part: 'B', context: '阴道', conditions: 'premise(high_1)' },
      ],
    },
  }

  beforeEach(() => {
    conditionEngine.clear()
    registerTestPremises()
    engine = new CommonTextsEngine()
  })

  it('should load data and report variables', () => {
    engine.loadFromData(defaultData, {})
    expect(engine.isLoaded).toBe(true)
    expect(engine.variables).toEqual(['vagina', 'penis', 'vagina_s'])
  })

  it('should return null for unknown variable', () => {
    engine.loadFromData(defaultData, {})
    expect(engine.getText('nonexistent', null)).toBeNull()
  })

  it('should return a single-part text', () => {
    engine.loadFromData(defaultData, {})
    const result = engine.getText('penis', null)
    expect(result).toBeTruthy()
    expect(['粗大的肉棒', '坚挺的性器']).toContain(result)
  })

  it('should return a multi-part concatenated text', () => {
    engine.loadFromData(defaultData, {})
    const result = engine.getText('vagina_s', null)
    expect(result).toBeTruthy()
    expect(result).toMatch(/^.+的(小穴|阴道)$/)
  })

  it('should replace variables in text', () => {
    engine.loadFromData(defaultData, {})
    const result = engine.replaceAll('她的{penis}插入我的{vagina}', null)
    expect(result).not.toContain('{penis}')
    expect(result).not.toContain('{vagina}')
  })

  it('should handle nested replacements (vagina contains vagina_s)', () => {
    engine.loadFromData(defaultData, {})
    const result = engine.replaceAll('她的{vagina}', null)
    expect(result).not.toContain('{vagina}')
    expect(result).not.toContain('{vagina_s}')
  })

  it('should preserve unknown variables', () => {
    engine.loadFromData(defaultData, {})
    const result = engine.replaceAll('{penis}和{unknown_var}', null)
    expect(result).toContain('{unknown_var}')
    expect(result).not.toContain('{penis}')
  })

  it('should apply mod override', () => {
    const modData: VariableData = {
      penis: {
        parts: [],
        description: 'mod 覆盖阴茎',
        entries: [
          { context: 'MOD版肉棒', conditions: '' },
        ],
      },
    }
    engine.loadFromData(defaultData, modData)
    expect(engine.getText('penis', null)).toBe('MOD版肉棒')
    expect(engine.getText('vagina', null)).toBeTruthy()
  })

  it('should return null when no conditions match', () => {
    conditionEngine.registerPremise('ALWAYS_FALSE', () => false)
    const data: VariableData = {
      test: {
        parts: [],
        description: '',
        entries: [
          { context: '看不到我', conditions: 'premise(ALWAYS_FALSE)' },
        ],
      },
    }
    engine.loadFromData(data, {})
    expect(engine.getText('test', null)).toBeNull()
  })
})
