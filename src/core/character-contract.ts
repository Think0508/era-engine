// 注释：角色契约校验器注册表（标准角色契约 spec §10.1 Step 5）
// 纯通用机制：core 层不认任何具体属性名——"最小必需集"等具体字段清单由插件层注册
// （h-core 注册 H/结算必需字段校验）。mod-loader 加载角色后调用全部注册的校验器。
// 校验失败一律 warning+建议（errorReporter），不阻止加载。

// 字段分层表（ADR-0007，角色字段作者分层）——mod 作者写角色/模板时的"写入层"：
// - L1 角色层：直接合理写入（不检查）
// - L2 非平凡：合法但罕见（需插件声明/动全局默认/仅首日意义），写了给提示
// - L3 引擎独占：系统运行时管理，写入无效/被重写，写了给警告
// 注意：结构命名空间名（first_times/h_state 等）与 condition-registry 注册的结构路径
// 同属"引擎结构"先例；属性名（好感度等）不在此表（属性层走 attributes.toml）。

import type { EntityData } from './types'
import type { LoadedMod } from './mod-types'
import { errorReporter } from './error-reporter'

/** L1：角色层直接可写（顶层键） */
export const AUTHOR_WRITABLE_TOP_KEYS: ReadonlySet<string> = new Set([
  // 基础元数据（template/extends 为模板继承链元数据，加载后保留在实体上）
  'id', 'name', 'template', 'extends',
  // 属性承载命名空间（属性名由 attributes.toml 定义）
  'base', 'params', 'marks', 'abilities', 'talents', 'experience',
  // 结构字段
  'first_times', 'status_effects', 'relations', 'inventory', 'equipment', 'assets',
  'behavior', 'current_location', 'dead', 'pregnancy',
])

/** L2：非平凡字段（顶层键）——写了给提示，不阻止 */
export const NONTRIVIAL_TOP_KEYS: ReadonlySet<string> = new Set([
  'sp_flag', // 自定义 flag 需插件声明
])

/** L3：引擎独占字段（顶层键）——系统运行时管理，写了无效 */
export const ENGINE_OWNED_TOP_KEYS: ReadonlySet<string> = new Set([
  'h_state', 'body_items', 'first_records',
  'dirty', 'hypnosis', 'action_info', 'achievement',
  'equipment_off', 'equipment_visible', 'equipment_blood',
  // 注释：npc-ai-system 运行时字段——行为块本体 + 条件镜像（state/current_behavior）
  'ai_behavior', 'state', 'current_behavior',
  // 注释：gain-rule-system 规则达成状态（once 规则；存档持久）
  'rule_state',
  // 注释：gain-rule-system 成就记录（player/character scope 达成表；存档持久）
  'achievements',
  // 注释：counter-system 计数器（惰性创建；唯一写入方 store.ts，存档随实体序列化）
  'counters',
  // 注释：body-shape-system 身材负载（胸围/臀围/身高/阴茎长度 cm）——唯一写入方 =
  // body-shape-system 的 reconcile/set/adjust（懒物化 + 数值权威）；作者写 TOML 字段无效
  // （会被下次读取按数值重算覆盖），故登记为引擎独占，给精确 warning 而非"未知顶层键"
  'body_shape',
])

/** 引擎结构命名空间（非 attributes 定义，但合法存在的顶层键） */
export const ENGINE_STRUCTURAL_TOP_KEYS: ReadonlySet<string> = new Set([
  'flags', // SEARCH_ORDER 结构命名空间（角色状态 flag）
])

/**
 * 顶层键分层检查（ADR-0007）：
 * - L3 引擎独占 → warning（写入无效）
 * - L2 非平凡（sp_flag/params/未知顶层键）→ warning（若确需请走插件声明/定义层）
 * 供 mod-loader validateCharacterContract 调用；纯结构检查，不涉及具体属性名。
 */
export function validateTopLevelLayers(
  charId: string,
  char: EntityData,
  mod: LoadedMod,
  knownCategoryNamespaces: Set<string>,
): void {
  const file = `mods/${mod.id}/characters/`
  for (const key of Object.keys(char)) {
    if (ENGINE_OWNED_TOP_KEYS.has(key)) {
      errorReporter.report({
        source: 'character-contract',
        severity: 'warning',
        file,
        message: `角色 '${charId}' 写入了引擎独占字段 '${key}'：该字段由系统运行时管理、写入无效（会被重置/重写）`,
        suggestion: `删除此字段；若确需设定请经插件声明或对账表 + spec §11 归档流程`,
      })
      continue
    }
    if (NONTRIVIAL_TOP_KEYS.has(key)) {
      errorReporter.report({
        source: 'character-contract',
        severity: 'warning',
        file,
        message: `角色 '${charId}' 写入了非平凡字段 '${key}'：正常角色数据不写`,
        suggestion: `若确需自定义 flag 请经插件声明（plugins 层注册）；否则删除此字段`,
      })
      continue
    }
    if (key === 'params' && char.params && typeof char.params === 'object') {
      // 注释：params 命名空间会被 applyAttributeDefaults 自动填充默认值（全员都有）——
      // 只有「值 ≠ 属性 default」才说明 mod 作者显式写了初始值（仅首日意义，L2 提示）
      const hasNonDefault = Object.entries(char.params as Record<string, any>).some(([k, v]) => {
        const def = mod.attributes[k]
        if (!def) return false // 未知键由裸字段检查兜底
        return typeof v === 'number' && v !== (def.default ?? 0)
      })
      if (hasNonDefault) {
        errorReporter.report({
          source: 'character-contract',
          severity: 'warning',
          file,
          message: `角色 '${charId}' 写入了 params（行为参数）：参数属性均 daily_reset（每日清零），初始值仅首日生效`,
          suggestion: `正常角色数据不写；如需改初始值请经 definitions/attributes.toml 调整 default`,
        })
        continue
      }
    }
    if (
      !AUTHOR_WRITABLE_TOP_KEYS.has(key) &&
      !ENGINE_STRUCTURAL_TOP_KEYS.has(key) &&
      !knownCategoryNamespaces.has(key)
    ) {
      errorReporter.report({
        source: 'character-contract',
        severity: 'warning',
        file,
        message: `角色 '${charId}' 使用了未知顶层字段 '${key}'：不在角色契约字段字典中`,
        suggestion: `若为 mod 自定义命名空间请经插件声明；否则检查拼写（参考 character-schema.md §11 分层表）`,
      })
    }
  }
}

export interface CharacterValidator {
  /** 校验器 ID（插件名） */
  id: string
  /**
   * 校验单个角色。禁止 throw（契约铁律：校验失败 warning+建议，不阻止加载）——
   * 内部用 errorReporter.report({severity: 'warning', ...})
   */
  validate: (charId: string, char: EntityData, mod: LoadedMod) => void
}

const validators = new Map<string, CharacterValidator>()

export function registerCharacterValidator(validator: CharacterValidator): void {
  if (validators.has(validator.id)) {
    // 重复注册 → 覆盖并警告（插件重载/幂等场景）；铁律：走 errorReporter，禁止 console
    errorReporter.report({
      source: 'character-contract',
      severity: 'warning',
      message: `校验器 '${validator.id}' 重复注册，后者覆盖`,
      suggestion: '插件重复 onLoad 会重复注册；如需幂等请在插件侧加守卫',
    })
  }
  validators.set(validator.id, validator)
}

export function getCharacterValidators(): CharacterValidator[] {
  return [...validators.values()]
}

export function clearCharacterValidators(): void {
  validators.clear()
}
