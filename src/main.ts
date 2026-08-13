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

// 注释：读取活跃模组（era-engine.config.toml active_mod 为缺省；localStorage
// 'era-engine:active-mod' 为运行时覆盖——切换模组界面写入后 reload）
// 返回空字符串 = 未指定 → 显示模组选择界面
function resolveActiveMod(): string {
  // 注释：localStorage 覆盖优先（ModSelect 写入）
  try {
    const override = localStorage.getItem('era-engine:active-mod')?.trim()
    if (override) return override
  } catch {
    // 注释：localStorage 不可用，忽略覆盖
  }
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
  return ''
}

// 注释：崩溃存档（对齐 erArk 99 号档位）——全局错误/未处理 Promise 拒绝 →
// 当前状态存入 99 槽 + error 级上报（红警告）。尽力而为，失败不阻断。
// ⚠️ 2026-08-14 审查修复：原 .then 回调内 saveGame 失败（如 no-save 模式/无模组）会
// 产生未捕获 rejection → 再次触发 unhandledrejection → 无限递归。补 .catch 终止链。
// ⚠️ 2026-08-14 第三轮审查：只在游戏会话中（gameScreen==='game'）写 99 槽——
// 标题/模组选择画面崩溃没有可存会话，写档只会覆盖玩家上次的崩溃档
function registerCrashSave(uiStore: any): void {
  const crashSave = () => {
    if (uiStore.gameScreen !== 'game') return
    import('./core/save-system')
      .then(async ({ saveGame }) => {
        await saveGame('99', uiStore.toSaveData(), '崩溃存档')
        const { errorReporter: er } = await import('./core/error-reporter')
        er.report({
          source: 'main',
          severity: 'error',
          message: '发生错误，当前游戏状态已存入 99 号存档位（可读回继续/排查）',
          suggestion: '99 槽为崩溃专用存档；如需手动存档请使用 SAVE 面板',
        })
      })
      .catch(() => {
        // 注释：崩溃存档失败静默（尽力而为，禁止再抛）
      })
  }
  window.addEventListener('error', crashSave)
  window.addEventListener('unhandledrejection', crashSave)
}

// 注释：页面隐藏时尽力自动存档（对齐 erArk 退出自动存；IndexedDB 事务原子，失败静默）
// ⚠️ 2026-08-14 第三轮审查：只在游戏会话中写 auto 槽——标题画面关页没有可存会话，
// 写档会覆盖玩家上次的睡醒自动档（初始状态顶掉真实进度）
function registerPagehideAutoSave(uiStore: any): void {
  const onPagehide = () => {
    if (uiStore.gameScreen !== 'game') return
    import('./core/save-system')
      .then(async ({ autoSave }) => {
        await autoSave(uiStore.toSaveData(), '页面关闭自动存档')
      })
      .catch(() => {
        // 注释：尽力而为，失败静默
      })
  }
  window.addEventListener('pagehide', onPagehide)
}

const activeModName = resolveActiveMod()

async function main(): Promise<void> {
  const pinia = createPinia()
  const app = createApp(App)
  app.use(pinia)

  const uiStore = useUIStore(pinia)
  uiStore.loadFromLocalStorage()

  // 注释：崩溃槽 + pagehide 自动存（需要 uiStore 提供存档数据）
  registerCrashSave(uiStore)
  registerPagehideAutoSave(uiStore)

  // 注释：1. 创建 SlotRegistry 并 provide（供 UI 插槽用）
  const slotRegistry = new SlotRegistry()
  app.provide(SLOT_REGISTRY_KEY, slotRegistry)

  // 注释：⚠️ 2026-08-14 审查修复——active_mod 未指定（空）时不能走完整初始化：
  // 原实现无条件 loadMod('') → parseModData 找不到 '/mods//meta.toml' → 启动失败页，
  // 模组选择界面永远到不了。空模组 = 最小挂载（只出 ModSelect 界面），
  // 选中模组后 localStorage 覆盖 + reload 走完整初始化。
  if (!activeModName) {
    uiStore.setGameScreen('mod_select')
    app.mount('#app')
    return
  }

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
  const pluginTomls = import.meta.glob('/src/plugins/*/plugin.toml', {  import: 'default', eager: true }) as Record<string, string>

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

  // 注释：12. 注册非插件覆盖的原生指令（audit-d I-5 修复：原 cheatCommands=true/setTheme('modern')
  // 调试默认值进生产——作弊指令现默认关闭（@ 前缀指令被 CommandBar 过滤），主题走 mod 主题+用户偏好）
  registerNativeCommands()
  uiStore.sidebarOpen = true

  // 注释：13. 进入顶层画面——active_mod 未指定 → 模组选择；否则标题界面
  // （读档从"继续冒险"进 SavePanel 读模式；新游戏从"新的冒险"进角色创建——均为 2026-08-14
  // 存档复刻接线。原直推 daily_menu 的临时启动流程移除）
  uiStore.setGameScreen(activeModName ? 'title' : 'mod_select')

  // 注释：14. 挂载 Vue 应用
  app.mount('#app')
}

main().catch(err => {
  // 注释：⚠️ 2026-08-14 第六轮审计——localStorage 模组覆盖残留兜底：
  // ModSelect 写入 'era-engine:active-mod' 后，开发者改 config.toml 的 active_mod
  // 不会生效（localStorage 优先）；且覆盖值失效（模组被删/改名）时启动必失败。
  // 失败路径：清除覆盖 → reload 重试 config 缺省。config 也失效则第二次失败正常报错
  try {
    if (localStorage.getItem('era-engine:active-mod')) {
      localStorage.removeItem('era-engine:active-mod')
      window.location.reload()
      return
    }
  } catch {
    // 注释：localStorage 不可用，走正常报错路径
  }
  console.error('引擎启动失败：', err)
  document.getElementById('app')!.innerHTML =
    `<p style="color:red;padding:20px">引擎启动失败：${err instanceof Error ? err.message : String(err)}</p>`
})
