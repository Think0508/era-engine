// 注释：main.ts 引擎入口
// 启动流程（两阶段初始化）：
// 1. 引擎 core 初始化（Phase 1-4 的 core）
// 2. 读 era-engine.config.toml 的 active_mod
// 3. active_mod 为空 → 显示 ModSelect
// 4. active_mod 非空 → 加载 mod → 显示 TitleScreen
// 5. 新游戏 → 实例化 player entity → pushMode('daily_menu')
// 6. 继续 → Phase 11 存档系统
// 注释：ModSelect 不写回配置文件，只内存切换

import { createApp, ref } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { modLoader } from './core/mod-loader'
import { gameContext } from './core/game-context'
import { entitySystem } from './core/entity-system'
import { themeManager } from './ui/theme/theme-manager'
import { EngineUIBridge } from './ui/engine-ui-bridge'
import { registerNativeCommands } from './ui/native-commands'
import { useGameStore } from './ui/stores/game-store'
import { useUIStore } from './ui/stores/ui-store'

// 注释：启动状态——title/modselect/game
type StartupPhase = 'loading' | 'modselect' | 'title' | 'game'
const startupPhase = ref<StartupPhase>('loading')

// 注释：mod 元信息（供 TitleScreen 显示）
const modInfo = ref<{ title?: string; description?: string; titleImage?: string }>({})

async function main() {
  const pinia = createPinia()
  const app = createApp(App)
  app.use(pinia)

  const uiStore = useUIStore(pinia)
  // 注释：加载 UI 偏好（localStorage）
  uiStore.loadFromLocalStorage()

  // 注释：创建并启动 bridge
  const bridge = new EngineUIBridge(pinia)
  bridge.start()

  // 注释：注册原生指令
  registerNativeCommands()

  // 注释：读 era-engine.config.toml
  // TODO: 解析配置文件获取 active_mod
  // 当前硬编码 test-mod
  const activeMod = 'test-mod'

  if (!activeMod) {
    // 注释：active_mod 为空 → 显示 ModSelect
    startupPhase.value = 'modselect'
  } else {
    // 注释：加载 mod
    await loadMod(activeMod)
    startupPhase.value = 'title'
  }

  // 注释：挂载 Vue app
  app.mount('#app')
}

async function loadMod(modId: string): Promise<void> {
  // 注释：执行 core 初始化步骤 5-9
  await modLoader.loadMod(modId)
  const mod = modLoader.getMod()
  if (!mod) throw new Error(`模组 '${modId}' 加载失败`)

  // 注释：加载主题
  await themeManager.loadModTheme(modId)
  // 注释：应用 UI 主题和深色模式偏好
  themeManager.setUITheme(useUIStore().theme)
  themeManager.setColorScheme(useUIStore().colorScheme)

  // 注释：mod 元信息
  modInfo.value = {
    title: (mod as any).name,
    description: (mod as any).description,
  }

  // 注释：同步初始状态到 game-store
  const gameStore = useGameStore()
  // 注释：设置玩家角色
  // TODO: 从 meta.toml 读 player_character
  const playerCharId = 'player'
  gameContext.setPlayer(playerCharId)
  gameStore.setPlayer(entitySystem.get('character', playerCharId))

  // 注释：设置起始地点
  // TODO: 从 meta.toml 读 starting_location
  const startLoc = entitySystem.get('location', 'town_square') as any
  if (startLoc) {
    gameContext.setLocation(startLoc)
    gameStore.setLocation(startLoc)
  }

  // 注释：同步 calendar/equipmentSlots
  gameStore.setCalendar(mod.calendar ? {
    month_names: mod.calendar.month_names,
    weekday_names: mod.calendar.weekday_names,
    hour_names: mod.calendar.hour_names,
  } : null)
  gameStore.setEquipmentSlots(mod.equipmentSlots)

  // 注释：刷新当前地点角色
  // TODO(phase-6): 用 home_locations 初始化角色 current_location
}

// 注释：启动
main().catch(err => {
  console.error('引擎启动失败：', err)
})

export { startupPhase, modInfo }
