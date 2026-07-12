// 注释：game-store 是 core GameContext 的 Vue 响应式镜像
// GameContext（core）是 source of truth，game-store 供 Vue 组件响应式读取
// 同步方向：core → Pinia（通过事件总线监听），Pinia → core（通过 bridge 调 core API）
// bridge 在 Task 5.15 实现，组件开发期间（Task 5.4-5.14）用 mock-data 填充

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { EntityData, LocationData, GameTimeData } from '../../core/types'

// 注释：LogEntry 与 core narrative-log 的 LogEntry 对应
export interface LogEntry {
  id: string
  text: string
  type: string
  source?: string
  timestamp?: number
  interactive?: boolean
  consumed?: boolean
  payload?: any
  _display?: {
    trigger?: 'auto' | 'click'
    display?: 'instant' | 'typewriter'
    speed?: number
    pause?: number
    color?: string
    size?: string
    font?: string
  }
}

// 注释：天气数据——Phase 5 占位，未来天气插件写入
interface WeatherData {
  name: string
  temperature: number
}

// 注释：CalendarConfig 与 mod-loader 的 CalendarConfig 对应
export interface CalendarConfig {
  month_names: string[]
  weekday_names: string[]
  hour_names?: string[]
}

// 注释：EquipmentSlot 与 mod-loader 的 EquipmentSlot 对应
export interface EquipmentSlot {
  id: string
  name: string
  category: string
}

const DEFAULT_TIME: GameTimeData = { minute: 0, hour: 8, day: 1, month: 1, year: 1 }
const DEFAULT_WEATHER: WeatherData = { name: '晴', temperature: 20 }
const MAX_LOG_ENTRIES = 1000

export const useGameStore = defineStore('game', () => {
  const player = ref<EntityData | null>(null)
  const location = ref<LocationData | null>(null)
  const time = ref<GameTimeData>({ ...DEFAULT_TIME })
  const modeStack = ref<string[]>(['exploration'])
  const executionState = ref<'IDLE' | 'EXECUTING'>('IDLE')
  const charactersAtLocation = ref<EntityData[]>([])
  const narrativeLogEntries = ref<LogEntry[]>([])
  const historyLog = ref<LogEntry[]>([])
  const weather = ref<WeatherData>({ ...DEFAULT_WEATHER })
  const calendar = ref<CalendarConfig | null>(null)
  const equipmentSlots = ref<EquipmentSlot[]>([])

  // Getters
  const currentMode = computed(() => modeStack.value[modeStack.value.length - 1] ?? 'exploration')
  const isExecuting = computed(() => executionState.value === 'EXECUTING')
  const isIdle = computed(() => executionState.value === 'IDLE')

  // Actions
  function setPlayer(e: EntityData | null) {
    player.value = e
  }
  function setLocation(loc: LocationData | null) {
    location.value = loc
  }
  function setTime(t: GameTimeData) {
    time.value = { ...t }
  }
  function pushMode(mode: string) {
    modeStack.value.push(mode)
  }
  function popMode(): string | undefined {
    return modeStack.value.pop()
  }
  function setExecutionState(s: 'IDLE' | 'EXECUTING') {
    executionState.value = s
  }
  function setCharactersAtLocation(chars: EntityData[]) {
    charactersAtLocation.value = chars
  }
  function refreshCharactersAtLocation() {
    // 注释：bridge 在 Task 5.15 实现真实查询，组件开发期间由 mock 数据设置
    // TODO(phase-6): 用 entity-system.getByType('character') 遍历过滤 current_location
  }
  function addLogEntry(entry: LogEntry) {
    narrativeLogEntries.value.push(entry)
    historyLog.value.push(entry)
    // 注释：historyLog 保留最近 5000 条（约 3000KB），超出时放弃最旧 2000 条保持空间
    // 不做分片/文件归档，因单条日志平均 < 1KB，5000 条对内存无压力
    // 如将来做跨会话历史持久化，可改为 IndexedDB 存储 + 按日期分片
    // 注释：自动淘汰——超过 MAX_LOG_ENTRIES 删最旧
    if (narrativeLogEntries.value.length > MAX_LOG_ENTRIES) {
      narrativeLogEntries.value = narrativeLogEntries.value.slice(-MAX_LOG_ENTRIES)
    }
    if (historyLog.value.length > 5000) {
      historyLog.value = historyLog.value.slice(-3000)
    }
  }
  function clearLogEntries() {
    narrativeLogEntries.value = []
  }
  function markLogConsumed(id: string) {
    const entry = narrativeLogEntries.value.find(e => e.id === id)
    if (entry) {
      entry.consumed = true
    }
  }
  function setWeather(w: WeatherData) {
    weather.value = { ...w }
  }
  function setCalendar(c: CalendarConfig | null) {
    calendar.value = c
  }
  function setEquipmentSlots(slots: EquipmentSlot[]) {
    equipmentSlots.value = slots
  }
  function reset() {
    player.value = null
    location.value = null
    time.value = { ...DEFAULT_TIME }
    modeStack.value = ['exploration']
    executionState.value = 'IDLE'
    charactersAtLocation.value = []
    narrativeLogEntries.value = []
    historyLog.value = []
    weather.value = { ...DEFAULT_WEATHER }
  }

  return {
    player,
    location,
    time,
    modeStack,
    executionState,
    charactersAtLocation,
    narrativeLogEntries,
    historyLog,
    weather,
    calendar,
    equipmentSlots,
    currentMode,
    isExecuting,
    isIdle,
    setPlayer,
    setLocation,
    setTime,
    pushMode,
    popMode,
    setExecutionState,
    setCharactersAtLocation,
    refreshCharactersAtLocation,
    addLogEntry,
    clearLogEntries,
    markLogConsumed,
    setWeather,
    setCalendar,
    setEquipmentSlots,
    reset,
  }
})
