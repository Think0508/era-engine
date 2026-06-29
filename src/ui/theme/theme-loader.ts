// 注释：theme-loader 负责
// 1. 解析 mod 的 theme.toml 为 ThemeConfig 结构
// 2. 将 ThemeConfig 注入为 CSS 变量到 :root
// 3. 支持深色模式：mod 可提供 [colors_dark] 段，未提供时引擎做简单算法反色 fallback
// 4. removeTheme 清除已注入的变量
// 所有 UI 组件只引用 CSS 变量，不硬编码颜色值

import { parse as parseTOML } from '@iarna/toml'

export interface ThemeConfig {
  colors: Record<string, string>
  colors_dark?: Record<string, string>
  typography: Record<string, string>
  spacing: Record<string, string>
  custom?: Record<string, string>
}

// 注释：THEME_VAR_MAP 定义 theme.toml 路径 → CSS 变量名的映射
// 引擎 UI 组件只使用这些变量名，mod 通过 theme.toml 控制具体值
const THEME_VAR_MAP: Record<string, string> = {
  'colors.primary': '--color-primary',
  'colors.secondary': '--color-secondary',
  'colors.background': '--color-background',
  'colors.surface': '--color-surface',
  'colors.text': '--color-text',
  'colors.text_secondary': '--color-text-secondary',
  'colors.border': '--color-border',
  'colors.success': '--color-success',
  'colors.danger': '--color-danger',
  'colors.warning': '--color-warning',
  'typography.font_body': '--font-body',
  'typography.font_title': '--font-title',
  'typography.font_size_base': '--font-size-base',
  'spacing.radius_button': '--radius-button',
  'spacing.radius_panel': '--radius-panel',
  'spacing.gap_small': '--gap-small',
  'spacing.gap_medium': '--gap-medium',
  'spacing.gap_large': '--gap-large',
}

// 注释：记录已注入的变量名，供 removeTheme 清除
let injectedVars: string[] = []

export function parseTheme(rawToml: string): ThemeConfig {
  try {
    const data = parseTOML(rawToml) as Record<string, any>
    return {
      colors: (data.colors as Record<string, string>) ?? {},
      colors_dark: data.colors_dark as Record<string, string> | undefined,
      typography: (data.typography as Record<string, string>) ?? {},
      spacing: (data.spacing as Record<string, string>) ?? {},
      custom: data.custom as Record<string, string> | undefined,
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`theme.toml 解析失败：${reason}`)
  }
}

export function injectTheme(config: ThemeConfig, colorScheme: 'light' | 'dark' = 'light'): void {
  const root = document.documentElement
  injectedVars = []

  // 注释：选择颜色集——深色模式优先用 colors_dark，未提供时用算法反色 fallback
  const selectedColors = selectColors(config, colorScheme)

  // 注释：遍历 THEME_VAR_MAP，设置 CSS 变量
  for (const [tomlPath, cssVar] of Object.entries(THEME_VAR_MAP)) {
    const [section, key] = tomlPath.split('.')
    // 注释：colors 段用 selectedColors（含深色模式 fallback），其他段直接从 config 读
    const sectionData =
      section === 'colors'
        ? selectedColors
        : getSection(config, section)
    if (sectionData && key in sectionData) {
      root.style.setProperty(cssVar, sectionData[key])
      injectedVars.push(cssVar)
    }
  }

  // 注释：mod 自定义变量映射为 --custom-{key}
  if (config.custom) {
    for (const [key, value] of Object.entries(config.custom)) {
      const varName = `--custom-${key}`
      root.style.setProperty(varName, value)
      injectedVars.push(varName)
    }
  }

  // 注释：设置 data-color-scheme 属性供 CSS 选择器区分
  root.setAttribute('data-color-scheme', colorScheme)
}

export function removeTheme(): void {
  const root = document.documentElement
  for (const varName of injectedVars) {
    root.style.removeProperty(varName)
  }
  injectedVars = []
  root.removeAttribute('data-color-scheme')
}

// 注释：选择颜色集——深色模式优先用 colors_dark，未提供时对 colors 做简单算法反色
function selectColors(config: ThemeConfig, scheme: 'light' | 'dark'): Record<string, string> {
  if (scheme === 'dark') {
    if (config.colors_dark && Object.keys(config.colors_dark).length > 0) {
      return config.colors_dark
    }
    // 注释：简单 fallback——对 colors 做亮度反转
    // TODO(phase-x): 深色模式算法反色 fallback 优化
    return invertColors(config.colors)
  }
  return config.colors
}

// 注释：简单算法反色——将 hex 颜色亮度反转，保持饱和度
function invertColors(colors: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, hex] of Object.entries(colors)) {
    result[key] = invertHex(hex)
  }
  return result
}

function invertHex(hex: string): string {
  // 注释：只处理 #RRGGBB 格式，其他格式原样返回
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex)
  if (!match) return hex
  const r = parseInt(match[1].slice(0, 2), 16)
  const g = parseInt(match[1].slice(2, 4), 16)
  const b = parseInt(match[1].slice(4, 6), 16)
  // 注释：亮度反转（255 - 原值），简单粗暴，后续可优化为 HSL 亮度反转
  const ir = 255 - r
  const ig = 255 - g
  const ib = 255 - b
  return `#${ir.toString(16).padStart(2, '0')}${ig.toString(16).padStart(2, '0')}${ib.toString(16).padStart(2, '0')}`
}

function getSection(config: ThemeConfig, section: string): Record<string, string> | undefined {
  if (section === 'colors') return config.colors
  if (section === 'typography') return config.typography
  if (section === 'spacing') return config.spacing
  return undefined
}
