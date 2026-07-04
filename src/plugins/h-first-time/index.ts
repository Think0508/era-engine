// 注释：h-first-time 插件——第一次系统，对齐 erArk
// 6 种处女（V/A/U/W/M/初吻）+ 阴茎初吻
// 存储详细记录（时间/地点/姿势）
// 首次剧痛 + 处女血 + 性无知移除

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'

const VIRGIN_KEYS = ['virgin_V', 'virgin_A', 'virgin_U', 'virgin_W', 'virgin_M', 'virgin_OTHER', 'virgin_KISS']

export function onLoad(_ctx: PluginContext): void {
  // 注释：第一次检查——对齐 erArk default.py（first sex effects 1101-1109）
  effectTypeRegistry.register('first_time_check', (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char) continue
      if (!char.first_times) char.first_times = {}
      const key = params.key ?? 'virgin_V'
      if (char.first_times[key]) continue  // 已破

      // 注释：标记已破
      char.first_times[key] = true

      // 注释：记录详情（对齐 erArk first_record）
      if (!char.first_records) char.first_records = {}
      const time = gameContext.getContext().time
      char.first_records[key] = {
        time: `${time.year}-${time.month}-${time.day} ${time.hour}:${time.minute}`,
        place: gameContext.getContext().location?.id ?? '',
        position: params.position ?? '',
      }

      // 注释：首次剧痛
      if (params.painValue) {
        if (!char.base) char.base = {}
        char.base['苦痛'] = Math.min(99999, (char.base['苦痛'] ?? 0) + (params.painValue as number))
      }

      // 注释：V 破处 → 移除性无知 + 处女血
      if (key === 'virgin_V') {
        // 注释：移除性无知（对齐 erArk talent[222] 移除）
        if (char.abilities?.['性无知']) {
          char.abilities['性无知'] = undefined
        }
        // 注释：处女血——内裤沾血，若无内裤则收集血滴
        bloodPanties(char)
      }

      narrativeLog.write(`${char.name ?? id} 失去了${key}`, 'system', 'h-first-time')

      // TODO: 触发 first_sex 二段行为（需 second_behavior 系统）
    }
    return true
  })

  // 注释：初吻检查
  effectTypeRegistry.register('first_kiss_check', (_params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char) continue
      if (!char.first_times) char.first_times = {}
      if (char.first_times['virgin_KISS']) continue
      char.first_times['virgin_KISS'] = true
      if (!char.first_records) char.first_records = {}
      const time = gameContext.getContext().time
      char.first_records['virgin_KISS'] = {
        time: `${time.year}-${time.month}-${time.day} ${time.hour}:${time.minute}`,
        place: gameContext.getContext().location?.id ?? '',
        position: '',
      }
      narrativeLog.write(`${char.name ?? id} 献出了初吻`, 'system', 'h-first-time')
    }
    return true
  })
}

export function onEnable(ctx: PluginContext): void {
  // 注释：注册前提
  const reg = (id: string, fn: (c: any) => boolean) => {
    try { (ctx.api as any).call('h-core', 'registerPremise', id, fn) } catch { }
  }

  function getTargetId(ctx2: any): string | null {
    return ctx2.selectedCharacterId ?? ctx2.uiStore?.selectedCharacterId ?? null
  }

  function getSelfId(ctx2: any): string | null {
    return ctx2.gameStore?.player?.id ?? ctx2.sourceId ?? null
  }

  reg('FIRST_SEX_IN_TODAY', (ctx2: any) => {
    const charId = getTargetId(ctx2)
    if (!charId) return false
    const char = entitySystem.get('character', charId) as any
    const records = char?.first_records
    if (!records) return false
    const now = gameContext.getContext().time
    const today = `${now.year}-${now.month}-${now.day}`
    return Object.values(records).some((r: any) => r?.time?.startsWith(today))
  })

  reg('FIRST_SEX_BEFORE_TODAY', (ctx2: any) => {
    const charId = getTargetId(ctx2)
    if (!charId) return false
    const char = entitySystem.get('character', charId) as any
    const records = char?.first_records
    if (!records) return false
    const now = gameContext.getContext().time
    const today = `${now.year}-${now.month}-${now.day}`
    return Object.values(records).some((r: any) => r?.time && !r.time.startsWith(today))
  })

  reg('HAVE_VIRGIN', (ctx2: any) => {
    const charId = getSelfId(ctx2)
    if (!charId) return false
    const char = entitySystem.get('character', charId) as any
    if (!char?.first_times) return true
    return VIRGIN_KEYS.some(k => !char.first_times[k])
  })

  reg('NO_VIRGIN', (_ctx2: any) => {
    const charId = getSelfId(_ctx2)
    if (!charId) return false
    const char = entitySystem.get('character', charId) as any
    if (!char?.first_times) return false
    return VIRGIN_KEYS.every(k => char.first_times[k])
  })

  ctx.api.register('h-first-time', {
    isVirgin: (charId: string, key?: string) => {
      const char = entitySystem.get('character', charId) as any
      if (!char?.first_times) return true
      if (key) return !char.first_times[key]
      return VIRGIN_KEYS.some(k => !char.first_times[k])
    },
    getRecord: (charId: string, key: string) => {
      const char = entitySystem.get('character', charId) as any
      return char?.first_records?.[key] ?? null
    },
    setFirstTime: (charId: string, key: string) => {
      const char = entitySystem.get('character', charId) as any
      if (!char) return
      if (!char.first_times) char.first_times = {}
      char.first_times[key] = true
    },
  })
}

// 注释：处女血处理——对齐 erArk default.py:1063-1085
function bloodPanties(char: any): void {
  // 注释：检查是否穿着内裤
  const panties = char.equipment?.panties
  if (panties) {
    // 注释：内裤沾血——标记
    if (!char.equipment_blood) char.equipment_blood = {}
    char.equipment_blood.panties = true
  }
  // TODO: 收集血滴到玩家收藏
  narrativeLog.write(`${char.name ?? char.id} 的${panties ? '内裤沾上了处女血' : '处女血滴落'}`, 'system', 'h-first-time')
}
