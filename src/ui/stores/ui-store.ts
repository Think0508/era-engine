// 注释：ui-store 管理所有 UI 状态
// - theme/sidebar/numpad/字体/深色模式等偏好 → localStorage（设备级，跨 mod 共享）
// - foldStates → 存档（游戏内状态，Phase 11 接入）
// - selectedCharacterId → 纯 UI 状态（Pinia，不存档不存 localStorage）
// TODO(phase-11): foldStates 存档持久化，当前只内存

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UITheme, ColorScheme } from '../theme/theme-manager'

const STORAGE_KEY = 'era-engine:ui-preferences'
// 注释：localStorage 不可用（隐私模式）时 try/catch 静默跳过，不报错不崩

interface FoldStates {
  status: boolean
  parameter: boolean
  look: boolean
  lookEquipment: boolean
  lookPortrait: boolean
  actCom: boolean
  exCom: boolean
  // 注释：可扩展——display_group 的折叠用 `parameter-{group名}` 等
  [key: string]: boolean
}

interface UIPreferences {
  theme: UITheme
  sidebarOpen: boolean
  sidebarMode: 'overlay' | 'sideBySide'
  sidebarWidth: number
  numpadVisible: boolean
  numpadNumbers: boolean
  numpadShortcuts: boolean
  showCommandNumbers: boolean
  displayMode: 'scroll' | 'clear'
  colorScheme: ColorScheme
  fontFamily: string
  fontSize: 'small' | 'medium' | 'large' | 'xlarge'
  showGroupTitles: boolean
  commandPopoverMode: boolean
  cheatCommands: boolean
  sidebarShowParameter: boolean
  favorites: string[]
}

export const useUIStore = defineStore('ui', () => {
  // 注释：UI 主题（era经典/现代）
  const theme = ref<UITheme>('era')
  // 注释：选中角色 ID（焦点），无 NPC 时为 null
  const selectedCharacterId = ref<string | null>(null)
  // 注释：折叠状态——保存到存档（Phase 11），当前只内存
  const foldStates = ref<FoldStates>({
    status: false,
    parameter: false,
    look: false,
    lookEquipment: false,
    lookPortrait: false,
    actCom: false,
    exCom: false,
  })
  // 注释：现代主题侧栏
  const sidebarOpen = ref(false)
  const sidebarMode = ref<'overlay' | 'sideBySide'>('overlay')
  const sidebarWidth = ref(300)
  // 注释：现代主题侧栏是否显示 Parameter 区
  const sidebarShowParameter = ref(true)
  // 注释：屏幕小键盘
  const numpadVisible = ref(false)
  const numpadNumbers = ref(false)
  const numpadShortcuts = ref(false)
  // 注释：指令栏
  const showCommandNumbers = ref(true)
  const displayMode = ref<'scroll' | 'clear'>('scroll')
  // 注释：显示偏好
  const colorScheme = ref<ColorScheme>('light')
  const fontFamily = ref('sans-serif')
  const fontSize = ref<'small' | 'medium' | 'large' | 'xlarge'>('medium')
  const showGroupTitles = ref(false)
  // 注释：角色指令栏开关（character_commands 从指令栏移除，只通过长按弹出）
  // TODO: Phase 5 留接口，长按弹出已实现
  const commandPopoverMode = ref(false)
  // 注释：作弊/调试指令可见开关（默认隐藏，在选项面板开启）
  const cheatCommands = ref(false)
  // 注释：收藏指令 ID 列表
  const favorites = ref<string[]>([])
  // 注释：当前打开的系统面板（null=无）
  const activePanel = ref<string | null>(null)
  // 注释：指令过滤（显示哪些类别）
  const commandFilter = ref<string[]>([])
  // 注释：指令分类显隐开关——true=显示该类
  const commandCategories = ref<Record<string, boolean>>({
    favorite: true,
    daily: true,
    obscenity: false,
    sex: false,
    combat: false,
    system: true,
    custom: true,
  })

  // Getters
  const hasSelection = computed(() => selectedCharacterId.value !== null)
  const isFolded = (section: string) => foldStates.value[section] ?? false

  // Actions
  function selectCharacter(id: string) {
    selectedCharacterId.value = id
  }
  function clearSelection() {
    selectedCharacterId.value = null
  }
  function toggleFold(section: string) {
    foldStates.value[section] = !foldStates.value[section]
  }
  function setTheme(t: UITheme) {
    theme.value = t
  }
  function openSidebar() {
    sidebarOpen.value = true
  }
  function closeSidebar() {
    sidebarOpen.value = false
  }
  function toggleSidebarMode() {
    sidebarMode.value = sidebarMode.value === 'overlay' ? 'sideBySide' : 'overlay'
  }
  function setActivePanel(name: string | null) {
    activePanel.value = name
  }
  function addFavorite(cmdId: string) {
    if (!favorites.value.includes(cmdId)) {
      favorites.value.push(cmdId)
    }
  }
  function removeFavorite(cmdId: string) {
    favorites.value = favorites.value.filter(id => id !== cmdId)
  }
  function setDisplayMode(m: 'scroll' | 'clear') {
    displayMode.value = m
  }
  function setColorScheme(s: ColorScheme) {
    colorScheme.value = s
  }
  function setFont(f: string) {
    fontFamily.value = f
  }
  function setFontSize(s: 'small' | 'medium' | 'large' | 'xlarge') {
    fontSize.value = s
  }
  function toggleGroupTitles() {
    showGroupTitles.value = !showGroupTitles.value
  }
  function toggleCategory(cat: string) {
    commandCategories.value[cat] = !commandCategories.value[cat]
  }
  function toggleCheatCommands() {
    cheatCommands.value = !cheatCommands.value
  }
  function toggleSidebarParameter() {
    sidebarShowParameter.value = !sidebarShowParameter.value
  }

  // 注释：localStorage 持久化——saveToLocalStorage/loadFromLocalStorage
  // 键 era-engine:ui-preferences（不加 mod 前缀，设备级跨 mod 共享）
  function getPreferences(): UIPreferences {
    return {
      theme: theme.value,
      sidebarOpen: sidebarOpen.value,
      sidebarMode: sidebarMode.value,
      sidebarWidth: sidebarWidth.value,
      numpadVisible: numpadVisible.value,
      numpadNumbers: numpadNumbers.value,
      numpadShortcuts: numpadShortcuts.value,
      showCommandNumbers: showCommandNumbers.value,
      displayMode: displayMode.value,
      colorScheme: colorScheme.value,
      fontFamily: fontFamily.value,
      fontSize: fontSize.value,
      showGroupTitles: showGroupTitles.value,
      commandPopoverMode: commandPopoverMode.value,
      cheatCommands: cheatCommands.value,
      sidebarShowParameter: sidebarShowParameter.value,
      favorites: favorites.value,
    }
  }

  function saveToLocalStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(getPreferences()))
    } catch {
      // 注释：localStorage 不可用（隐私模式），静默跳过
    }
  }

  function loadFromLocalStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const prefs = JSON.parse(raw) as UIPreferences
      theme.value = prefs.theme
      sidebarOpen.value = prefs.sidebarOpen
      sidebarMode.value = prefs.sidebarMode
      sidebarWidth.value = prefs.sidebarWidth
      numpadVisible.value = prefs.numpadVisible
      numpadNumbers.value = prefs.numpadNumbers
      numpadShortcuts.value = prefs.numpadShortcuts
      showCommandNumbers.value = prefs.showCommandNumbers
      displayMode.value = prefs.displayMode
      colorScheme.value = prefs.colorScheme
      fontFamily.value = prefs.fontFamily
      fontSize.value = prefs.fontSize
      showGroupTitles.value = prefs.showGroupTitles
      commandPopoverMode.value = prefs.commandPopoverMode
      cheatCommands.value = prefs.cheatCommands ?? false
      sidebarShowParameter.value = prefs.sidebarShowParameter ?? true
      favorites.value = prefs.favorites ?? []
    } catch {
      // 注释：localStorage 不可用或 JSON 解析失败，静默跳过
    }
  }

  // 注释：存档序列化——foldStates 供存档系统（Phase 11）
  function toSaveData(): { foldStates: FoldStates } {
    return { foldStates: { ...foldStates.value } }
  }
  function fromSaveData(data: { foldStates: FoldStates }) {
    if (data?.foldStates) {
      foldStates.value = { ...foldStates.value, ...data.foldStates }
    }
  }

  return {
    theme,
    selectedCharacterId,
    foldStates,
    sidebarOpen,
    sidebarMode,
    sidebarWidth,
    numpadVisible,
    numpadNumbers,
    numpadShortcuts,
    showCommandNumbers,
    displayMode,
    colorScheme,
    fontFamily,
    fontSize,
    showGroupTitles,
    commandPopoverMode,
    cheatCommands,
    toggleCheatCommands,
    sidebarShowParameter,
    toggleSidebarParameter,
    favorites,
    activePanel,
    commandFilter,
    commandCategories,
    toggleCategory,
    hasSelection,
    isFolded,
    selectCharacter,
    clearSelection,
    toggleFold,
    setTheme,
    openSidebar,
    closeSidebar,
    toggleSidebarMode,
    setActivePanel,
    addFavorite,
    removeFavorite,
    setDisplayMode,
    setColorScheme,
    setFont,
    setFontSize,
    toggleGroupTitles,
    saveToLocalStorage,
    loadFromLocalStorage,
    toSaveData,
    fromSaveData,
  }
})
