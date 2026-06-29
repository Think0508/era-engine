// 注释：theme-manager 管理 mod 主题加载与 UI 主题切换（era经典/现代）
// 单例模式，引擎启动时加载 mod theme，运行时可切换 UI 主题和深色模式

import { injectTheme, removeTheme, type ThemeConfig } from './theme-loader'
import { modLoader } from '../../core/mod-loader'

export type UITheme = 'era' | 'modern'
export type ColorScheme = 'light' | 'dark'

class ThemeManager {
  private currentModTheme: ThemeConfig | null = null
  private currentUITheme: UITheme = 'era'
  private currentColorScheme: ColorScheme = 'light'

  // 注释：加载 mod 的 theme.toml 并注入 CSS 变量
  // modId 参数用于日志/错误报告，当前从 modLoader.getMod() 获取已解析数据
  async loadModTheme(_modId: string): Promise<void> {
    const mod = modLoader.getMod()
    if (!mod) {
      // 注释：mod 未加载，跳过主题注入
      return
    }
    // 注释：从 mod-loader 获取已解析的 theme 数据，重新组装为 ThemeConfig
    // mod.theme 是 Record<string, Record<string, string>>，对应 ThemeConfig 的各段
    this.currentModTheme = {
      colors: mod.theme.colors ?? {},
      colors_dark: mod.theme.colors_dark as Record<string, string> | undefined,
      typography: mod.theme.typography ?? {},
      spacing: mod.theme.spacing ?? {},
    }
    this.applyTheme()
  }

  // 注释：直接用 ThemeConfig 加载（供测试和 mod 未走 mod-loader 时使用）
  loadThemeDirectly(config: ThemeConfig): void {
    this.currentModTheme = config
    this.applyTheme()
  }

  // 注释：切换 UI 主题（era经典/现代），设置 data-ui-theme 属性
  setUITheme(theme: UITheme): void {
    this.currentUITheme = theme
    document.documentElement.setAttribute('data-ui-theme', theme)
  }

  getUITheme(): UITheme {
    return this.currentUITheme
  }

  // 注释：切换深色/浅色模式，重新注入对应颜色集
  setColorScheme(scheme: ColorScheme): void {
    this.currentColorScheme = scheme
    this.applyTheme()
  }

  getColorScheme(): ColorScheme {
    return this.currentColorScheme
  }

  // 注释：卸载主题，清除所有 CSS 变量和属性
  unload(): void {
    removeTheme()
    document.documentElement.removeAttribute('data-ui-theme')
    this.currentModTheme = null
  }

  private applyTheme(): void {
    if (!this.currentModTheme) return
    removeTheme()
    injectTheme(this.currentModTheme, this.currentColorScheme)
  }
}

export const themeManager = new ThemeManager()
