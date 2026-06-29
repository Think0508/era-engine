import { describe, it, expect } from 'vitest'
import { formatText } from '../ui/utils/text-formatter'

// 注释：Phase 7 集成测试——dialogue-system + 文字格式
// 完整端到端测试需要 browser 环境，这里测可独立验证的部分

describe('Phase 7 集成测试', () => {
  it('text-formatter 解析加粗+斜体混合', () => {
    const result = formatText('**重要**消息*注意*')
    expect(result.some(s => s.bold && s.text === '重要')).toBe(true)
    expect(result.some(s => s.italic && s.text === '注意')).toBe(true)
  })

  it('text-formatter 解析 spoiler（黑框）', () => {
    const result = formatText('||隐藏内容||')
    expect(result[0].spoiler).toBe(true)
    expect(result[0].text).toBe('隐藏内容')
  })

  it('text-formatter 解析颜色 hex RGB', () => {
    const result = formatText('{{color:#FF0000 红色}}')
    expect(result[0].color).toBe('#FF0000')
    expect(result[0].text).toBe('红色')
  })

  it('text-formatter 解析颜色含透明度', () => {
    const result = formatText('{{color:#80FF0000 半透明}}')
    expect(result[0].color).toBe('#80FF0000')
  })

  it('text-formatter 普通文本无格式标记', () => {
    const result = formatText('这是一段普通文本')
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('这是一段普通文本')
    expect(result[0].bold).toBeUndefined()
    expect(result[0].color).toBeUndefined()
  })

  it('text-formatter 混合格式分段正确', () => {
    const result = formatText('前**中**后')
    // 注释：应分为 3 段：前(普通) + 中(加粗) + 后(普通)
    expect(result.length).toBeGreaterThanOrEqual(3)
    expect(result[0].text).toBe('前')
    expect(result[1].bold).toBe(true)
    expect(result[1].text).toBe('中')
  })
})
