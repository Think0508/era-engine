// 注释：main.ts 引擎入口——加载插件 + 启动游戏

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { parse as parseTOML } from '@iarna/toml'
import './style.css'
import App from './App.vue'
import { modLoader } from './core/mod-loader'
import { gameContext } from './core/game-context'
import { entitySystem } from './core/entity-system'
import { eventBus } from './core/event-bus'
import { apiSystem } from './core/api'
import { commandRegistry } from './core/command-registry'
import { bindingResolver } from './core/binding-resolver'
import { conditionRegistry } from './core/condition-registry'
import { PluginManager, warnMissingPluginTomls } from './core/plugin-manager'
import { EngineUIBridge } from './ui/engine-ui-bridge'
import { themeManager } from './ui/theme/theme-manager'
import { SlotRegistry, SLOT_REGISTRY_KEY } from './ui/slots/slot-registry'
import { registerNativeCommands } from './ui/native-commands'
import { useGameStore } from './ui/stores/game-store'
import { useUIStore } from './ui/stores/ui-store'
import { errorReporter } from './core/error-reporter'
import configRaw from '../era-engine.config.toml?raw'

// 注释：读取活跃模组（era-engine.config.toml active_mod；切换模组改此值后重启 dev）
function resolveActiveMod(): string {
  try {
    const data = parseTOML(configRaw) as { active_mod?: string }
    const name = data?.active_mod?.trim()
    if (name) return name
  } catch (err) {
    errorReporter.report({
      source: 'main',
      severity: 'error',
      message: `era-engine.config.toml 解析失败：${err instanceof Error ? err.message : String(err)}`,
      suggestion: '检查配置文件格式',
    })
  }
  return 'test-mod'
}
const activeModName = resolveActiveMod()

async function main(): Promise<void> {
  const pinia = createPinia()
  const app = createApp(App)
  app.use(pinia)

  const uiStore = useUIStore(pinia)
  uiStore.loadFromLocalStorage()

  // 注释：1. 创建 SlotRegistry 并 provide（供 UI 插槽用）
  const slotRegistry = new SlotRegistry()
  app.provide(SLOT_REGISTRY_KEY, slotRegistry)

  // 注释：2. 加载活跃模组（loadMod 内部已注册 characters + locations 到 entity-system）
  await modLoader.loadMod(activeModName)
  const mod = modLoader.getMod()
  if (!mod) throw new Error('模组加载失败')

  // 注释：2.5 加载画面素材（方案 B，2026-08-10）——mod meta.toml 声明 loading_video/loading_image
  // 路径相对 mod 根（如 "assets/loading.gif"）；未声明 → 保持 index.html 的闪烁文字 fallback（不报错）。
  // 素材需为浏览器可访问路径（dev 下 Vite 直接服务项目根；生产构建的资源处理后续补）。
  // 视频优先于图片；Vue mount 会替换 #app 内容 → 占位随引擎就绪自动消失。
  const loadingMedia = mod.loadingVideo ?? mod.loadingImage
  if (loadingMedia) {
    const screen = document.getElementById('loading-screen')
    if (screen) {
      const mediaEl = mod.loadingVideo ? document.createElement('video') : document.createElement('img')
      if (mod.loadingVideo) {
        const video = mediaEl as HTMLVideoElement
        video.autoplay = true
        video.muted = true
        video.loop = true
        video.playsInline = true
        video.src = `/mods/${activeModName}/${mod.loadingVideo}`
      } else {
        ;(mediaEl as HTMLImageElement).src = `/mods/${activeModName}/${mod.loadingImage}`
      }
      mediaEl.style.maxWidth = '90vw'
      mediaEl.style.maxHeight = '90vh'
      screen.insertBefore(mediaEl, screen.firstChild)
    }
  }

  // 注释：3. 加载 bindings
  bindingResolver.loadBindings(mod.bindings)

  // 注释：4. 注册 condition fields
  conditionRegistry.clear()
  conditionRegistry.registerFromAttributes(mod.attributes)
  conditionRegistry.registerFromBindings(mod.bindings)

  // 注释：6. 设置玩家和起始地点（mod meta.toml 声明，缺省兜底）
  gameContext.setPlayer(mod.playerCharacter ?? 'player')
  const startLoc = entitySystem.get('location', mod.startingLocation ?? '') as any
  if (startLoc) {
    gameContext.setLocation(startLoc)
  } else {
    // 注释：mod 未声明起始地点或地点不存在 → 取第一个地点兜底
    const firstLoc = mod.locations.values().next().value as any
    if (firstLoc) gameContext.setLocation(firstLoc)
  }

  // 注释：7. 创建 PluginManager 并发现引擎插件
  const pluginManager = new PluginManager(apiSystem, eventBus, slotRegistry, commandRegistry)

  // 注释：孤儿插件检测（2026-08-12：有 index.ts 无 plugin.toml → 静默不加载，warning 上报）
  warnMissingPluginTomls()

  // 注释：动态扫描 src/plugins/ 下所有插件的 plugin.toml + index.ts
  const pluginModules = import.meta.glob('/src/plugins/*/index.ts', { eager: true }) as Record<string, any>
  const pluginTomls = import.meta.glob('/src/plugins/*/plugin.toml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

  const enginePlugins = new Map<string, { toml: string; module?: any }>()
  for (const [path, toml] of Object.entries(pluginTomls)) {
    const dirName = path.match(/\/src\/plugins\/([^/]+)\//)?.[1]
    if (!dirName) continue
    const modulePath = `/src/plugins/${dirName}/index.ts`
    enginePlugins.set(dirName, {
      toml,
      module: pluginModules[modulePath] ?? undefined,
    })
  }

  // 注释：8. 加载插件（onLoad → onEnable，含 data_dependencies topo-sort）
  await pluginManager.loadPlugins(enginePlugins, new Map())

  // 注释：9. 加载主题
  try {
    await themeManager.loadModTheme(activeModName)
    themeManager.setUITheme(uiStore.theme)
    themeManager.setColorScheme(uiStore.colorScheme)
  } catch { /* 主题加载失败不影响核心功能 */ }

  // 注释：10. 创建 bridge 并同步初始状态
  const bridge = new EngineUIBridge(pinia)
  bridge.start()
  bridge.syncInitialState()

  // 注释：11. 同步 mod 的 calendar/equipmentSlots + 刷新当前地点角色
  const gameStore = useGameStore(pinia)
  gameStore.setCalendar(mod.calendar ? {
    month_names: mod.calendar.month_names,
    weekday_names: mod.calendar.weekday_names,
    hour_names: mod.calendar.hour_names,
  } : null)
  gameStore.setEquipmentSlots(mod.equipmentSlots)
  bridge.refreshCharactersAtLocation(startLoc?.id ?? 'town_square')

  // 注释：12. 注册非插件覆盖的原生指令 + 开启作弊模式（临时，方便测试）
  registerNativeCommands()
  uiStore.cheatCommands = true
  uiStore.setTheme('modern')
  uiStore.sidebarOpen = true

  // 注释：13. 进入游戏——push bridge 创建后自动同步
  gameStore.pushMode('daily_menu') // 暂时推每日菜单，后续改为标题→新游戏流程

  // 注释：14. 挂载 Vue 应用
  app.mount('#app')
}

main().catch(err => {
  console.error('引擎启动失败：', err)
  document.getElementById('app')!.innerHTML =
    `<p style="color:red;padding:20px">引擎启动失败：${err instanceof Error ? err.message : String(err)}</p>`
})
