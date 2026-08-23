// 插件默认层 [styles] 加载（2026-08-23）：collectPluginDefaultStyles 纯函数测试
// 语义：各插件 data/default/talk/styles.toml 为基座，mod 层同名键整体覆盖；
// 多插件同名键按 rawTomlMap 顺序后者覆盖前者。
import { describe, expect, it } from 'vitest'
import { collectPluginDefaultStyles } from '../core/mod-parse'

const API_STYLES = `[styles]\nnarrator = { color = "#666666", font = "楷体" }\nwhisper = { display = "typewriter", speed = 70 }\n`

describe('collectPluginDefaultStyles', () => {
  it('无默认层样式 → 空表', () => {
    const raw: Record<string, string> = {
      '/mods/example-mod/definitions/talk/styles.toml': `[styles]\nemphasis = { color = "#FF0000" }\n`,
    }
    expect(collectPluginDefaultStyles(raw as never)).toEqual({})
  })

  it('单个插件默认层样式进入基座', () => {
    const raw: Record<string, string> = {
      '/src/plugins/theme-a/data/default/talk/styles.toml': API_STYLES,
      '/mods/x/definitions/talk/styles.toml': `[styles]\nlocal = { color = "#00FF00" }\n`,
    }
    const merged = collectPluginDefaultStyles(raw as never)
    expect(merged.narrator?.color).toBe('#666666')
    expect(merged.whisper?.display).toBe('typewriter')
    expect(merged.whisper?.speed).toBe(70)
  })

  it('多插件同名样式键：后序覆盖前序（rawTomlMap 顺序）', () => {
    const raw: Record<string, string> = {
      '/src/plugins/aaa/data/default/talk/styles.toml': `[styles]\nnarrator = { color = "#111111" }\n`,
      '/src/plugins/zzz/data/default/talk/styles.toml': `[styles]\nnarrator = { color = "#222222", font = "楷体" }\n`,
    }
    const merged = collectPluginDefaultStyles(raw as never)
    expect(merged.narrator).toEqual({ color: '#222222', font: '楷体' })
  })

  it('非 styles.toml 路径（instructions 等）被忽略', () => {
    const raw: Record<string, string> = {
      '/src/plugins/x/data/default/instructions/daily.toml': `[[instructions]]\nid = "a"\n`,
      '/src/plugins/x/data/default/talk-common/...': `variable = "v"\n`,
    }
    expect(collectPluginDefaultStyles(raw as never)).toEqual({})
  })

  it('解析失败抛错（与 mod 数据同强度）', () => {
    const raw: Record<string, string> = {
      '/src/plugins/x/data/default/talk/styles.toml': `[styles]\nbroken = {\n`,
    }
    expect(() => collectPluginDefaultStyles(raw as never)).toThrow()
  })
})