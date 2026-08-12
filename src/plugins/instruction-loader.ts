// 注释：指令加载器（L1.6 统一 loader）
// 从 modLoader.mod.instructions 加载指令 TOML（插件默认层 + mod 定义层已在 mod-loader 合并去重）
// 支持 [effect_blocks] 复用 + effects 引用
// judge_base 存在时自动注入 judge_check effect（置顶执行，失败则 settle_* 跳过）
// 单条指令注册失败 → errorReporter 报告 + 跳过该条（铁律：插件错误降级，不死锁启动）
//
// 校验分离：condition/premises/hConfig adjustments 的字段校验依赖全部插件的
// condition_fields 与 premises 注册完毕（plugin-manager 在全部 onEnable 后发 game:plugins_loaded），
// 因此 validateInstructionData() 由 h-core 监听该事件时调用，注册本身在 h-core onEnable 即完成。

import { conditionEngine } from '../core/condition-engine'
import { commandRegistry, type CommandDef } from '../core/command-registry'
import { modLoader, type LoadedMod, type HInstruction } from '../core/mod-loader'
import { errorReporter } from '../core/error-reporter'
import { conditionRegistry } from '../core/condition-registry'
import type { Effect } from '../core/effect-type-registry'

function resolveEffects(
  raw: HInstruction,
  blocks: Record<string, Effect>,
): Effect[] {
  if (!raw.effects || raw.effects.length === 0) return []
  const resolved: Effect[] = []
  for (const item of raw.effects) {
    if (typeof item === 'string') {
      // 引用 effect_block——未知块名 → 警告（禁止静默丢效果）
      const block = blocks[item]
      if (block) {
        resolved.push({ ...block })
      } else {
        errorReporter.report({
          source: 'instruction-loader',
          severity: 'warning',
          message: `指令 '${raw.id}' 引用了不存在的 effect_block：'${item}'，该效果被跳过`,
          suggestion: '检查 [effect_blocks] 中的定义名，或把 effects 写为内联对象',
        })
      }
      continue
    }
    // 内联 effect
    resolved.push(item as Effect)
  }
  return resolved
}

// 注释：judge_base 存在 → 自动注入 judge_check（判定失败 retreated 时 settle_* 跳过）
export function injectJudgeCheck(raw: HInstruction, effects: Effect[]): Effect[] {
  const judgeBase = raw.judge_base
  if (typeof judgeBase !== 'number' || !(judgeBase > 0)) return effects
  const params: Record<string, any> = { base: judgeBase }
  if (raw.judge_class) params.judge_class = raw.judge_class
  return [{ type: 'judge_check', params }, ...effects]
}

export function loadInstructions(): void {
  const mod = modLoader.getMod() as LoadedMod
  if (!mod) return
  const allInstructions = mod.instructions ?? []
  if (allInstructions.length === 0) return

  const blocks = mod.effectBlocks ?? {}

  for (const raw of allInstructions) {
    // 注释：幂等保护——onEnable 重跑（插件重载/热更新场景）时同 id 指令已注册则跳过，
    // 避免 commandRegistry 重复注册抛错刷屏（指令数据刷新属 HMR 后续 TODO）
    if (commandRegistry.getById(raw.id)?.source === 'instructions') continue
    try {
      registerInstruction(raw, blocks)
    } catch (err) {
      // 注释：单条失败（如 id 重复）→ 报告 + 继续，不拖垮整批
      errorReporter.report({
        source: 'instruction-loader',
        severity: 'warning',
        message: `指令 '${raw.id}' 注册失败：${err instanceof Error ? err.message : String(err)}`,
        suggestion: '检查指令 id 是否与已有指令重复，或字段格式是否正确',
      })
    }
  }
}

// 注释：延迟校验（game:plugins_loaded 后调用）——此时所有插件 condition_fields/premises 已注册
// - 指令 condition 引用未注册字段 → error + 注销该指令（AGENTS §21：加载时校验，禁止静默失效）
// - 指令 premises 引用未注册前提 → warning（去重，运行时非严格模式会静默跳过，必须提示）
// - hConfig [judge.adjustments] 修正条件 → error
export function validateInstructionData(): void {
  const mod = modLoader.getMod() as LoadedMod
  if (!mod) return

  // 注释：hConfig adjustments 修正条件校验
  validateAdjustmentConditions(mod)

  const registeredPremises = new Set(conditionEngine.getRegisteredPremiseIds())
  const reportedPremises = new Set<string>()

  for (const raw of mod.instructions ?? []) {
    if (raw.condition) {
      const { ok, unknown } = conditionRegistry.validateExpression(raw.condition)
      if (!ok) {
        errorReporter.report({
          source: 'instruction-loader',
          severity: 'error',
          message: `指令 '${raw.id}' 的 condition 引用了未注册字段/前提：${unknown.join(', ')}（条件：${raw.condition}）`,
          suggestion: '对照 可用条件属性手册 检查字段路径；premise:XXX 需在插件 onLoad 注册（engine API premises.register）',
        })
        // 注释：注册已完成，条件不可达的指令注销（防止点击后静默无反应）
        // 仅注销本 loader 注册的指令（source='instructions'），避免误删同名插件/原生指令
        const existing = commandRegistry.getById(raw.id)
        if (existing?.source === 'instructions') {
          commandRegistry.unregister(raw.id)
        }
        continue
      }
    }

    if (raw.premises) {
      for (const p of raw.premises) {
        // 注释：前提名大小写不敏感（conditionEngine 注册时 lower 化）；
        // 未注册前提 = 数据错误（Q4 定案：与 condition 同强度）→ error + 注销该指令
        if (!registeredPremises.has(p.toLowerCase())) {
          if (!reportedPremises.has(p.toLowerCase())) {
            reportedPremises.add(p.toLowerCase())
            errorReporter.report({
              source: 'instruction-loader',
              severity: 'error',
              message: `指令 '${raw.id}' 引用了未注册前提：${p}`,
              suggestion: '在插件 onEnable 注册 handler（engine API premises.register，语义查 erArk handle_premise_*.py），或移除该前提（SOP §4）',
            })
          }
          const existing = commandRegistry.getById(raw.id)
          if (existing?.source === 'instructions') {
            commandRegistry.unregister(raw.id)
          }
          break
        }
      }
    }

    // 注释：自动注入前提完整性校验（2026-08-08 erArk 前提自动化更新，SOP §4.1）——
    // erArk 按 h_mode_show_type/tired_type 运行时注入前提（handle_instruct.py:134-152），
    // 我们静态展开进 TOML。带迁移字段的指令必须包含对应展开前提，缺漏 → warning
    // （防止 erArk 更新注入集合后已迁移指令漏补——chat 曾漏 NOT_SHOW/DRUNK 两个）
    validateAutoInjectedPremises(raw)
  }
}

// 注释：自动注入前提映射（erArk handle_instruct.py:134-152，SOP §4.1）
// 键：字段前缀:值；值：必须展开进 premises 的前提列表
const AUTO_INJECTED_PREMISES: Record<string, string[]> = {
  'h_mode:1': ['NOT_H', 'NOT_SHOW_NON_H_IN_HIDDEN_SEX'],
  'h_mode:2': ['TARGET_IS_H'],
  'tired:1': ['TIRED_LE_84', 'HP_G_1', 'DRUNK_LEVEL_NOT_3'],
  'tired:2': ['TIRED_LE_74', 'HP_G_1', 'DRUNK_LEVEL_NOT_3'],
}

function validateAutoInjectedPremises(raw: HInstruction): void {
  if (raw.erark_h_mode_show_type === undefined && raw.erark_tired_type === undefined) return
  const has = new Set((raw.premises ?? []).map(p => p.toLowerCase()))
  const expected: Record<string, string[]> = {}
  if (raw.erark_h_mode_show_type !== undefined) {
    expected['h_mode_show_type'] = AUTO_INJECTED_PREMISES[`h_mode:${raw.erark_h_mode_show_type}`] ?? []
  }
  if (raw.erark_tired_type !== undefined) {
    expected['tired_type'] = AUTO_INJECTED_PREMISES[`tired:${raw.erark_tired_type}`] ?? []
  }
  for (const [field, premises] of Object.entries(expected)) {
    const missing = premises.filter(p => !has.has(p.toLowerCase()))
    if (missing.length > 0) {
      errorReporter.report({
        source: 'instruction-loader',
        severity: 'warning',
        message: `指令 '${raw.id}' 的 ${field}=${raw.erark_h_mode_show_type ?? raw.erark_tired_type} 自动注入前提缺失：${missing.join(', ')}`,
        suggestion: `按 SOP §4.1 展开 erArk 自动注入的前提（handle_instruct.py:134-152）；erArk 更新后须核对此映射`,
      })
    }
  }
}

// 注释：hConfig [judge.adjustments] 的 condition 与指令 condition 同标准校验
function validateAdjustmentConditions(mod: LoadedMod): void {
  const adjustments = (mod.hConfig as any)?.judge?.adjustments as Record<string, { condition: string; value: number }[]> | undefined
  if (!adjustments) return
  for (const [judgeClass, entries] of Object.entries(adjustments)) {
    for (const entry of entries) {
      if (!entry?.condition) continue
      const { ok, unknown } = conditionRegistry.validateExpression(entry.condition)
      if (!ok) {
        errorReporter.report({
          source: 'instruction-loader',
          severity: 'error',
          message: `判定族 '${judgeClass}' 的修正条件引用了未注册字段：${unknown.join(', ')}（条件：${entry.condition}）`,
          suggestion: '检查 h-config.toml [judge.adjustments]，字段路径须存在于条件手册（含结构路径：talents./first_times./relations. 等）',
        })
      }
    }
  }
}

function registerInstruction(raw: HInstruction, blocks: Record<string, Effect>): void {
  const baseEffects = resolveEffects(raw, blocks)
  const effects = injectJudgeCheck(raw, baseEffects)

  const categoryMap: Record<string, string> = {
    daily: 'daily', obscenity: 'obscenity', sex: 'sex',
    arts: 'arts', play: 'play', work: 'work', system: 'system', social: 'social',
  }
  // 注释：category（spec §3 规范名）优先，type（旧别名）兜底
  const category = raw.category ?? categoryMap[raw.type ?? ''] ?? 'custom'

  let modes: string[]
  const typeKey = raw.category ?? raw.type ?? ''
  if (typeKey === 'sex') modes = ['h_scene']
  else if (typeKey === 'obscenity') modes = ['exploration']
  else modes = raw.modes ?? ['exploration']

  const subCategory = raw.sub_category ?? (raw.sub_type && raw.sub_type !== '0' ? raw.sub_type : undefined)

  if (raw.judge_class && !raw.judge_base) {
    errorReporter.report({
      source: 'instruction-loader',
      severity: 'warning',
      message: `指令 '${raw.id}' 写了 judge_class='${raw.judge_class}' 但没有 judge_base，judge_class 将被忽略`,
      suggestion: '有判定才写 judge_base；judge_class 只跟随 judge_base（SOP §6 三问决策）',
    })
  }
  if (raw.time_cost === undefined) {
    errorReporter.report({
      source: 'instruction-loader',
      severity: 'warning',
      message: `指令 '${raw.id}' 缺少 time_cost，使用默认值 30`,
      suggestion: 'time_cost 必须查 Behavior_Data.csv + handle_instruct.py 后填写（SOP §5），-1 需查 handler 真实值',
    })
  }
  // 注释：M9 校验（2026-08-11）——advance_to_hour 越界/settle_mode 非法会静默按普通指令处理
  if (raw.advance_to_hour !== undefined) {
    const h = Number(raw.advance_to_hour)
    if (!Number.isInteger(h) || h < 0 || h > 23) {
      errorReporter.report({
        source: 'instruction-loader',
        severity: 'error',
        message: `指令 '${raw.id}' 的 advance_to_hour=${raw.advance_to_hour} 非法（合法 0-23），指令注销`,
        suggestion: 'advance_to_hour 是跨天推进的目标小时（如 6 = 睡到次日 6:00）',
      })
      return
    }
  }
  if (raw.settle_mode !== undefined && raw.settle_mode !== 'rest' && raw.settle_mode !== 'sleep') {
    errorReporter.report({
      source: 'instruction-loader',
      severity: 'error',
      message: `指令 '${raw.id}' 的 settle_mode='${raw.settle_mode}' 非法（合法 rest/sleep），指令注销`,
      suggestion: 'settle_mode 驱动实时结算：rest 不积累疲劳；sleep 额外 2 倍削减疲劳+熟睡积累+体力恢复',
    })
    return
  }

  const cmdDef: CommandDef = {
    id: raw.id,
    label: raw.label,
    group: 'character_commands',
    modes,
    category,
    sub_category: subCategory,
    timeCost: raw.time_cost ?? 30,
    settleMode: raw.settle_mode,
    advanceToHour: raw.advance_to_hour,
    priority: raw.priority ?? 50,
    premises: raw.premises,
    condition: raw.condition,
    effects,
    source: 'instructions',
    tags: raw.tags,
  }
  commandRegistry.register(cmdDef)
}
