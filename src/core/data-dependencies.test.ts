import { describe, it, expect } from 'vitest'
import { resolveDataDependencies, type DataDependencyInfo } from './data-dependencies'

describe('data-dependencies', () => {
  it('无依赖的插件按原顺序返回', () => {
    const plugins: DataDependencyInfo[] = [
      { pluginId: 'a', provides: [], dependsOn: [] },
      { pluginId: 'b', provides: [], dependsOn: [] },
    ]
    expect(resolveDataDependencies(plugins)).toEqual(['a', 'b'])
  })

  it('被依赖的插件排在前面', () => {
    const plugins: DataDependencyInfo[] = [
      { pluginId: 'map', provides: ['map:loaded'], dependsOn: ['characters:initialized'] },
      { pluginId: 'char', provides: ['characters:initialized'], dependsOn: [] },
    ]
    const sorted = resolveDataDependencies(plugins)
    expect(sorted.indexOf('char')).toBeLessThan(sorted.indexOf('map'))
  })

  it('多级依赖链正确排序', () => {
    const plugins: DataDependencyInfo[] = [
      { pluginId: 'dialogue', provides: ['dialogue:ready'], dependsOn: ['characters:initialized'] },
      { pluginId: 'map', provides: ['map:loaded'], dependsOn: ['characters:initialized'] },
      { pluginId: 'char', provides: ['characters:initialized'], dependsOn: [] },
    ]
    const sorted = resolveDataDependencies(plugins)
    expect(sorted.indexOf('char')).toBeLessThan(sorted.indexOf('map'))
    expect(sorted.indexOf('char')).toBeLessThan(sorted.indexOf('dialogue'))
  })

  it('循环依赖不断链', () => {
    const plugins: DataDependencyInfo[] = [
      { pluginId: 'a', provides: ['cap-a'], dependsOn: ['cap-b'] },
      { pluginId: 'b', provides: ['cap-b'], dependsOn: ['cap-a'] },
    ]
    // 注释：循环依赖不崩，返回两个插件
    const sorted = resolveDataDependencies(plugins)
    expect(sorted).toHaveLength(2)
    expect(sorted).toContain('a')
    expect(sorted).toContain('b')
  })

  it('depends_on 指向不存在的 capability 不崩', () => {
    const plugins: DataDependencyInfo[] = [
      { pluginId: 'a', provides: [], dependsOn: ['nonexistent:capability'] },
    ]
    // 注释：不存在的 capability 依赖被忽略
    expect(resolveDataDependencies(plugins)).toEqual(['a'])
  })
})
