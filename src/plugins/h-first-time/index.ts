// 注释：h-first-time 插件——第一次系统，对齐 erArk
// 6 种处女（V/A/U/W/M/初吻）+ 阴茎初吻
// 存储详细记录（时间/地点/姿势）
// 首次剧痛 + 处女血 + 性无知移除

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { ATTR } from '../../core/entity-utils'

const VIRGIN_KEYS = ['virgin_V', 'virgin_A', 'virgin_U', 'virgin_W', 'virgin_M', 'virgin_OTHER', 'virgin_KISS']

// 注释：破处键 → 处女天赋 映射（标准角色契约分层审计 2026-08-09）：
// 处女天赋与 first_times 双源漂移修复——talk-common 口上条件（talents.肛门处女 == 0 等）
// 依赖破处后天赋翻转，此前只删性无知不删天赋 → 口上分支永久失效
const VIRGIN_TALENT_MAP: Record<string, string> = {
  virgin_V: '阴道处女',
  virgin_A: '肛门处女',
  virgin_U: '尿道处女',
  virgin_W: '子宫处女',
  virgin_KISS: '无接吻经验',
}

function removeVirginTalent(char: any, key: string): void {
  const talentId = VIRGIN_TALENT_MAP[key]
  if (talentId && char.talents?.[talentId] !== undefined) {
    delete char.talents[talentId]
  }
}

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

      // 注释：破处 → 移除对应处女天赋（双源漂移修复，2026-08-09）
      removeVirginTalent(char, key)

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
        char.base[ATTR.PAIN] = Math.min(99999, (char.base[ATTR.PAIN] ?? 0) + (params.painValue as number))
      }

      // 注释：V 破处 → 移除性无知 + 处女血
      if (key === 'virgin_V') {
        // 注释：移除性无知（对齐 erArk talent[222] 移除）
        // 2026-08-12（audit-b I3）：性无知是 talents 天赋（h-core/data/default/talents.toml:744），
        // 原删 char.abilities['性无知'] 删错命名空间 → 天赋永不移除（口上/判定 性无知 修正恒生效）。
        // 顺带清理历史错误写入的 abilities 同名键（旧版本可能落过账）
        if (char.talents?.['性无知'] !== undefined) {
          delete char.talents['性无知']
        }
        if (char.abilities?.['性无知'] !== undefined) {
          delete char.abilities['性无知']
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
      // 注释：初吻 → 移除无接吻经验天赋（双源漂移修复，2026-08-09）
      removeVirginTalent(char, 'virgin_KISS')
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
  let premiseRegWarned = false
  const reg = async (id: string, fn: (c: any) => boolean) => {
    try { await ctx.api.call('engine', 'premises.register', id, fn) } catch (err) {
      if (!premiseRegWarned) {
        premiseRegWarned = true
        errorReporter.report({
          source: 'h-first-time',
          severity: 'warning',
          message: "前提注册失败（h-core 未就绪？）：" + (err instanceof Error ? err.message : String(err)),
          suggestion: 'h-core plugin may not be loaded (registerPremise API) - this plugin premises will be unavailable',
        })
      }
    }
  }

  function getTargetId(ctx2: any): string | null {
    return ctx2.selectedCharacterId ?? ctx2.uiStore?.selectedCharacterId ?? null
  }

  function getSelfId(ctx2: any): string | null {
    return ctx2.gameStore?.player?.id ?? ctx2.sourceId ?? null
  }

  // 注释：目标今天是否有首次记录（FIRST_SEX_IN_TODAY 族共用——Minor 3 修复（第九轮）合并重复）
  // ⚠️ 部位变体近似（T_FIRST_A/U_SEX_IN_TODAY）：first_records 的部位维度（position）
  // 未细分解析——A/U 变体暂用"今天有首次记录"同 handler 近似，部位细化随 h-first-time 扩展；
  // ⚠️ 无前缀 FIRST_SEX_IN_TODAY 数据零引用（erArk 无前缀应查自己——本实现查目标，
  // 保留为 T_ 族的共享 handler，语义差异随 h-first-time 迭代修正）
  const firstSexToday = (ctx2: any) => {
    const charId = getTargetId(ctx2)
    if (!charId) return false
    const char = entitySystem.get('character', charId) as any
    const records = char?.first_records
    if (!records) return false
    const now = gameContext.getContext().time
    const today = `${now.year}-${now.month}-${now.day}`
    return Object.values(records).some((r: any) => r?.time?.startsWith(today))
  }
  reg('FIRST_SEX_IN_TODAY', firstSexToday)
  // ★ 修复（第八轮）：数据引用 T_ 前缀版（t_first_sex_in_today 等，400-735 行/条）——
  // 原只有无前缀版（FIRST_SEX_IN_TODAY 语义即查目标，命名不一致）；T_ 版挂在 h-core
  // pendingFalse 恒 false 占位上静默死亡。补别名激活。
  reg('T_FIRST_SEX_IN_TODAY', firstSexToday)
  reg('T_FIRST_A_SEX_IN_TODAY', firstSexToday)
  reg('T_FIRST_U_SEX_IN_TODAY', firstSexToday)

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
      // 注释：双源联动（ADR-0007）——与 first_time_check 一致，同步移除对应处女天赋
      removeVirginTalent(char, key)
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
