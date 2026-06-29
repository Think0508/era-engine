// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { parseTheme, injectTheme, removeTheme, type ThemeConfig } from './theme-loader'

describe('theme-loader', () => {
  beforeEach(() => {
    removeTheme()
  })

  it('parseTheme parses valid TOML correctly', () => {
    const raw = [
      '[colors]',
      'primary = "#3B82F6"',
      'background = "#F8FAFC"',
      '[typography]',
      'font_body = "sans-serif"',
      '[spacing]',
      'gap_small = "8px"',
    ].join('\n')
    const config = parseTheme(raw)
    expect(config.colors.primary).toBe('#3B82F6')
    expect(config.colors.background).toBe('#F8FAFC')
    expect(config.typography.font_body).toBe('sans-serif')
    expect(config.spacing.gap_small).toBe('8px')
  })

  it('parseTheme throws on invalid TOML', () => {
    expect(() => parseTheme('this is = = invalid')).toThrow(/theme\.toml/)
  })

  it('parseTheme handles missing sections gracefully', () => {
    const config = parseTheme('[colors]\nprimary = "#000"')
    expect(config.colors.primary).toBe('#000')
    expect(config.typography).toEqual({})
    expect(config.spacing).toEqual({})
  })

  it('injectTheme sets CSS variables on :root', () => {
    const config: ThemeConfig = {
      colors: { primary: '#3B82F6', background: '#F8FAFC' },
      typography: { font_body: 'sans-serif' },
      spacing: { gap_small: '8px' },
    }
    injectTheme(config, 'light')
    const root = document.documentElement
    expect(root.style.getPropertyValue('--color-primary')).toBe('#3B82F6')
    expect(root.style.getPropertyValue('--color-background')).toBe('#F8FAFC')
    expect(root.style.getPropertyValue('--font-body')).toBe('sans-serif')
    expect(root.style.getPropertyValue('--gap-small')).toBe('8px')
  })

  it('injectTheme sets data-color-scheme attribute', () => {
    const config: ThemeConfig = {
      colors: { primary: '#000' },
      typography: {},
      spacing: {},
    }
    injectTheme(config, 'dark')
    expect(document.documentElement.getAttribute('data-color-scheme')).toBe('dark')
  })

  it('injectTheme injects custom variables with --custom- prefix', () => {
    const config: ThemeConfig = {
      colors: {},
      typography: {},
      spacing: {},
      custom: { accent: '#FF0000' },
    }
    injectTheme(config, 'light')
    expect(document.documentElement.style.getPropertyValue('--custom-accent')).toBe('#FF0000')
  })

  it('removeTheme clears all injected variables', () => {
    const config: ThemeConfig = {
      colors: { primary: '#3B82F6' },
      typography: { font_body: 'sans-serif' },
      spacing: {},
    }
    injectTheme(config, 'light')
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#3B82F6')
    removeTheme()
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--font-body')).toBe('')
    expect(document.documentElement.hasAttribute('data-color-scheme')).toBe(false)
  })

  it('injectTheme dark mode uses colors_dark when available', () => {
    const config: ThemeConfig = {
      colors: { primary: '#3B82F6', background: '#F8FAFC' },
      colors_dark: { primary: '#1E40AF', background: '#1E293B' },
      typography: {},
      spacing: {},
    }
    injectTheme(config, 'dark')
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#1E40AF')
    expect(document.documentElement.style.getPropertyValue('--color-background')).toBe('#1E293B')
  })

  it('injectTheme dark mode falls back to algorithmic inversion when no colors_dark', () => {
    // 注释：无 colors_dark 时，引擎对 colors 做简单亮度反转
    const config: ThemeConfig = {
      colors: { primary: '#000000', background: '#FFFFFF' },
      typography: {},
      spacing: {},
    }
    injectTheme(config, 'dark')
    // 注释：#000000 反色 → #FFFFFF，#FFFFFF 反色 → #000000
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#ffffff')
    expect(document.documentElement.style.getPropertyValue('--color-background')).toBe('#000000')
  })
})
