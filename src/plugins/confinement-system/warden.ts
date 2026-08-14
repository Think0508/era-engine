// 注释：监狱长系统（阶段C）——任命/解除 + 每日训练结算
// erArk 对照：manage_basement_panel.py select_new_work（:1337）/ WorkType.csv 191 监狱长 /
//   default.py handle_train_prisoners_add_adjust（:7069）训练结算
//
// ⚠️ 半成品标记（grill Q7 定案）：
//   - 训练频率：每日 new_day 结算一次（erArk 是监狱长 60 分钟工作行为 TRAIN_PRISONER 一次）
//     数据结构留 interval 字段——通用工作系统落地后切回工作行为链触发
//   - 监狱长 AI 移动：不做（任命即生效，不强制出现在关押区）——工作系统落地后补
//   - 任命前提：陷落 ≥3（FALL_LEVEL_GE_3，h-core premise-fall）+ 有囚犯（PRISONER_IN_CUSTODY）
//   - 不能兼任助理：引擎无助理概念，跳过（erArk 专属限制）

import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { apiSystem } from '../../core/api'
import { modLoader } from '../../core/mod-loader'
import { bindingResolver } from '../../core/binding-resolver'
import { getState, getSettings } from './state'

// 注释：监狱长宿舍地点 tag（erArk 关押区休息室——宿舍固定在关押区）
export const WARDEN_DORM_TAG = 'warden_rest'

// 注释：训练模式定义（erArk Confinement_Training_Setting 设置1 的 6 种模式）
// 数据来源：data/default/training.toml（mod 可 override——6 模式扩展指南见
// docs/confinement-system.md §训练模式扩展）
export interface TrainingModeDef {
  id: number
  name: string
  // 状态结算（h-core settleState：state=状态名, baseValue=基础值）
  state?: string
  stateBase?: number
  // 能力经验（experience 数组索引 0-7 部位经验 / 其他经验 id）
  experienceId?: number
  experienceValue?: number
  // 能力习得（abilities.能力名 提升）
  ability?: string
  abilityValue?: number
  // 属性修改（path → 数值累加；⚠️ 2026-08-14 审查修复：原"绝对值设置"导致
  // 训练把等级降回固定值（如屈服刻印永远=1）——统一为累加语义）
  setFields?: { path: string; value: number }[]
  // 监狱长属性加成：使用监狱长的能力等级作为结算等级（abilityLevel）
  wardenAbility?: string
}

// 注释：任命监狱长（erArk select_new_work——换任先解除旧，宿舍搬关押区休息室）
export async function designateWarden(charId: string): Promise<boolean> {
  const char = entitySystem.get('character', charId) as any
  if (!char) {
    errorReporter.report({
      source: 'confinement-system',
      severity: 'warning',
      message: `任命监狱长失败：角色 '${charId}' 不存在`,
    })
    return false
  }
  const state = getState()

  // 换任：解除旧监狱长（erArk :1341-1347——旧监狱长宿舍还原）
  // ⚠️ 2026-08-14 审查：宿舍移动走 character API moveTo（发 character:changed，一致性）
  const oldWarden = state.wardenId
  if (oldWarden && oldWarden !== charId) {
    const old = entitySystem.get('character', oldWarden) as any
    if (old?.sp_flag?.pre_dormitory) {
      try {
        await apiSystem.call('character', 'moveTo', oldWarden, old.sp_flag.pre_dormitory)
      } catch {
        old.current_location = old.sp_flag.pre_dormitory
      }
      old.sp_flag.pre_dormitory = ''
      eventBus.emit('character:changed', { id: old.id })
    }
    narrativeLog.write(`${old?.name ?? oldWarden} 卸任监狱长。`, 'system', 'confinement-system')
  }

  // 新监狱长宿舍 → 关押区休息室（存旧宿舍，换任时还原）
  const wardenRest = findWardenRestLocation()
  if (wardenRest && !char.sp_flag?.pre_dormitory) {
    if (!char.sp_flag) char.sp_flag = {}
    char.sp_flag.pre_dormitory = char.current_location ?? ''
    try {
      await apiSystem.call('character', 'moveTo', charId, wardenRest)
    } catch {
      char.current_location = wardenRest
    }
  }

  state.wardenId = charId
  eventBus.emit('confinement:warden_changed', { warden: charId, previous: oldWarden })
  eventBus.emit('character:changed', { id: charId })
  narrativeLog.write(`${char.name ?? charId} 被任命为监狱长。`, 'system', 'confinement-system')
  return true
}

// 注释：解除监狱长（erArk 换任/卸任——宿舍还原）
export async function removeWarden(): Promise<void> {
  const state = getState()
  const oldWarden = state.wardenId
  if (!oldWarden) return
  const old = entitySystem.get('character', oldWarden) as any
  if (old?.sp_flag?.pre_dormitory) {
    try {
      await apiSystem.call('character', 'moveTo', oldWarden, old.sp_flag.pre_dormitory)
    } catch {
      old.current_location = old.sp_flag.pre_dormitory
    }
    old.sp_flag.pre_dormitory = ''
    eventBus.emit('character:changed', { id: old.id })
  }
  state.wardenId = null
  eventBus.emit('confinement:warden_changed', { warden: null, previous: oldWarden })
  narrativeLog.write(`${old?.name ?? oldWarden} 被解除监狱长职务。`, 'system', 'confinement-system')
}

// 注释：找监狱长休息室（带 warden_rest tag 的地点；无 → null，跳过宿舍搬移）
function findWardenRestLocation(): string | null {
  const mod = modLoader.getMod()
  if (!mod) return null
  for (const [locId, loc] of mod.locations) {
    if (loc.tags?.includes(WARDEN_DORM_TAG)) return locId
  }
  return null
}

// 注释：训练模式数据（data/default/training.toml 加载后注入——插件默认层数据）
let trainingModes: TrainingModeDef[] = []

export function setTrainingModes(modes: TrainingModeDef[]): void {
  trainingModes = modes
}

export function getTrainingModes(): TrainingModeDef[] {
  return trainingModes
}

// 注释：每日训练结算（erArk handle_train_prisoners_add_adjust :7069）
// 监狱长存在 + 设置1（training）≠0 时对所有囚犯结算一次（跳过 1 异常/睡觉中）
// ⚠️ 半成品：每日一次为简化（interval 字段预留），工作系统落地后切行为链
export async function settleTraining(): Promise<void> {
  const state = getState()
  const wardenId = state.wardenId
  const s = getSettings()
  if (!wardenId || s.training <= 0) return
  const mode = trainingModes.find(m => m.id === s.training)
  if (!mode) {
    errorReporter.report({
      source: 'confinement-system',
      severity: 'warning',
      message: `训练模式 ${s.training} 未定义（data/default/training.toml）`,
      suggestion: '检查 training.toml 的 [[modes]] 定义（id 1-6）',
    })
    return
  }
  const warden = entitySystem.get('character', wardenId) as any
  // ⚠️ 2026-08-14 三轮审查：监狱长不可用（离线/逃跑中/被监禁/不存在）→ 训练跳过
  // （原实现无检查，监狱长被装袋/逃跑后训练照跑 = 无监狱长监督的静默叙事错位）
  if (!warden || warden.sp_flag?.offline || warden.sp_flag?.escaping || warden.sp_flag?.imprisonment) {
    narrativeLog.write(`监狱长不在，日常训练取消了。`, 'system', 'confinement-system')
    return
  }
  // 监狱长属性等级（如 [36] 苦痛快乐经验——武侠语境用能力等级）
  let wardenLevel: number | null = null
  if (mode.wardenAbility) {
    const wardenAb = warden?.abilities?.[mode.wardenAbility]
    if (wardenAb) {
      wardenLevel = wardenAb.level ?? 0
    } else {
      // ⚠️ 2026-08-14 四轮审查：wardenAbility 引用的能力不存在 → 上报一次（防静默降级：
      // 训练结算无能力等级加成；默认 training.toml 的"经验"需 mod 定义或 override）
      errorReporter.report({
        source: 'confinement-system',
        severity: 'warning',
        message: `训练模式 ${mode.id}（${mode.name}）的 wardenAbility '${mode.wardenAbility}' 在监狱长身上不存在，训练无能力等级加成`,
        suggestion: 'mod 需定义该能力（definitions/abilities.toml）或 override training.toml 的 wardenAbility',
      })
    }
  }

  for (const [charId] of Object.entries(state.prisoners)) {
    const char = entitySystem.get('character', charId) as any
    if (!char) continue
    // 跳过 1 异常（睡眠/昏迷/时停——erArk 跳过 1 异常或睡觉中的囚犯）
    if ((char.sp_flag?.unconscious_h ?? 0) >= 1) continue
    // 消耗囚犯 HP/MP（erArk 训练消耗 -1×degree——简化：-5 HP/-3 MP）
    // ⚠️ 2026-08-14 四轮审查：原走 modify_attribute（attr='hp'）经 bindingResolver.get 全局
    // 解析——多插件绑定同名键（combat-base 也绑 hp）时可能命中别的插件映射（扣错属性）。
    // 改用 getForPlugin 读写本插件绑定（与 escape.ts 逃脱公式的 hp/mp 读取一致，ADR 0010）
    try {
      const hp = bindingResolver.getForPlugin('confinement-system', charId, 'hp')
      if (typeof hp === 'number') {
        bindingResolver.setForPlugin('confinement-system', charId, 'hp', Math.max(0, hp - 5))
      }
      const mp = bindingResolver.getForPlugin('confinement-system', charId, 'mp')
      if (typeof mp === 'number') {
        bindingResolver.setForPlugin('confinement-system', charId, 'mp', Math.max(0, mp - 3))
      }
    } catch { /* 未绑定 hp/mp → 跳过消耗（不报错） */ }

    // 状态结算（h-core settleState——部位快感/苦痛/好意等）
    if (mode.state && mode.stateBase !== undefined) {
      try {
        await apiSystem.call('h-core', 'settleState', charId, mode.state, mode.stateBase, 60, {
          abilityLevel: wardenLevel ?? null,
          extraAdjust: 0,
        })
      } catch (err) {
        errorReporter.report({
          source: 'confinement-system',
          severity: 'warning',
          message: `训练状态结算失败：${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }

    // 能力经验（部位经验等——experience 数组）
    if (mode.experienceId !== undefined && mode.experienceValue !== undefined) {
      if (!char.experience) char.experience = {}
      char.experience[mode.experienceId] = (char.experience[mode.experienceId] ?? 0) + mode.experienceValue
    }

    // 能力习得（如性爱技巧——abilities.技巧.level 提升）
    if (mode.ability && mode.abilityValue) {
      if (!char.abilities) char.abilities = {}
      if (!char.abilities[mode.ability]) char.abilities[mode.ability] = { level: 0, xp: 0 }
      char.abilities[mode.ability].level = Math.min(
        (char.abilities[mode.ability].level ?? 0) + mode.abilityValue,
        10,
      )
    }

    // 直接字段（心理服从 = 屈服刻印等）——累加语义（修复：原绝对值设置会把等级降回固定值）
    if (mode.setFields) {
      for (const f of mode.setFields) {
        try {
          const current = await getPathValue(char, f.path)
          const next = (typeof current === 'number' ? current : 0) + (f.value ?? 0)
          await apiSystem.call('character', 'setField', charId, f.path, next)
        } catch { /* 路径不存在 → 跳过 */ }
      }
    }
    eventBus.emit('character:changed', { id: charId })
  }
  narrativeLog.write(`监狱长对囚犯进行了日常训练。`, 'system', 'confinement-system')
}

// 注释：按点路径读取实体字段（setEntityPath 的读对应——abilities.xxx.level 等）
async function getPathValue(char: any, path: string): Promise<unknown> {
  const parts = path.split('.')
  let current: any = char
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    current = current[part]
  }
  return current
}
