// 注释：main.ts 引擎入口——加载插件 + 启动游戏

import { createApp } from 'vue'
import { createPinia } from 'pinia'
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
import { PluginManager } from './core/plugin-manager'
import { EngineUIBridge } from './ui/engine-ui-bridge'
import { themeManager } from './ui/theme/theme-manager'
import { SlotRegistry, SLOT_REGISTRY_KEY } from './ui/slots/slot-registry'
import { registerNativeCommands } from './ui/native-commands'
import { useGameStore } from './ui/stores/game-store'
import { useUIStore } from './ui/stores/ui-store'

async function main(): Promise<void> {
  const pinia = createPinia()
  const app = createApp(App)
  app.use(pinia)

  const uiStore = useUIStore(pinia)
  uiStore.loadFromLocalStorage()

  // 注释：1. 创建 SlotRegistry 并 provide（供 UI 插槽用）
  const slotRegistry = new SlotRegistry()
  app.provide(SLOT_REGISTRY_KEY, slotRegistry)

  // 注释：2. 加载 test-mod
  await modLoader.loadMod('test-mod')
  const mod = modLoader.getMod()
  if (!mod) throw new Error('模组加载失败')

  // 注释：3. 注册 locations 到 entity-system
  for (const [id, loc] of mod.locations) {
    entitySystem.register('location', id, loc as any)
  }

  // 注释：4. 加载 bindings
  bindingResolver.loadBindings(mod.bindings)

  // 注释：5. 注册 condition fields
  conditionRegistry.clear()
  conditionRegistry.registerFromAttributes(mod.attributes)
  conditionRegistry.registerFromBindings(mod.bindings)

  // 注释：6. 设置玩家和起始地点
  gameContext.setPlayer('player')
  const startLoc = entitySystem.get('location', 'town_square') as any
  if (startLoc) gameContext.setLocation(startLoc)

  // 注释：7. 创建 PluginManager 并发现引擎插件
  const pluginManager = new PluginManager(apiSystem, eventBus, slotRegistry, commandRegistry)

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
    await themeManager.loadModTheme('test-mod')
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

  // 注释：12. 注册非插件覆盖的原生指令
  registerNativeCommands()

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
