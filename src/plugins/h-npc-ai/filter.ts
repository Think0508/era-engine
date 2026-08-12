// 注释：逆推/群交 AI 的指令筛选（2026-08-11 grill Q6/Q10 定案）
// 数据基础：指令 tag 词表（part:/flag: 前缀，h-npc-ai onEnable 校验强制）
//   part:breast|clit|vagina|anus|urethra|womb —— 逆推部位（erArk N/B/C/V/A/U/W）
//   part:mouth|hand|penis|worship               —— 群交槽位
//   flag:first-time                             —— 破处类（目标部位处女时跳过）
//   flag:no-active                              —— 非逆推类（逆推排除）
// 道具/药物/SM 排除用现有 sub_category（item/drug/sm），不新增 tag
//
// 过滤链（对齐 erArk handle_npc_ai_in_h.py:479-537 npc_active_h）：
//   category == 'sex' → 排除 sub_category item/drug/sm → 排除 flag:no-active →
//   破处检查（flag:first-time + 目标部位未破 → 跳过）→ 部位 tag 匹配 → 前提评估

import { commandRegistry, type CommandDef } from '../../core/command-registry'
import { entitySystem } from '../../core/entity-system'
import { modLoader } from '../../core/mod-loader'
import { errorReporter } from '../../core/error-reporter'
import { gameContext } from '../../core/game-context'
import { conditionEngine } from '../../core/condition-engine'

// 注释：tag 词表（校验 + 过滤共用；未知 part:/flag: 值 → 校验器报错）
export const PART_TAGS = ['breast', 'clit', 'mouth', 'vagina', 'anus', 'urethra', 'womb', 'hand', 'penis', 'worship'] as const
export const FLAG_TAGS = ['first-time', 'no-active', 'control'] as const

// 注释：逆推部位 → 匹配的 part: tag（erArk part_id 0-7：0=N 乳/1=B 胸/2=C 阴蒂/
// 4=V 阴道/5=A 肛门/6=U 尿道/7=W 子宫；3=阴茎强制排除）
// 本引擎乳/胸合一（BODY_PART_CID 3=胸/乳房）→ 0 和 1 都映射 part:breast
export const PART_ID_TO_TAGS: Record<number, string[]> = {
  0: ['part:breast'],
  1: ['part:breast'],
  2: ['part:clit'],
  4: ['part:vagina'],
  5: ['part:anus'],
  6: ['part:urethra'],
  7: ['part:womb'],
}

// 注释：群交槽位 → part: tag
export const SLOT_TO_TAG: Record<string, string> = {
  mouth: 'part:mouth',
  L_hand: 'part:hand',
  R_hand: 'part:hand',
  penis: 'part:penis',
  anal: 'part:anus',
  worship: 'part:worship',
}

// 注释：破处键（char.first_times 键）——h-first-time 插件 VIRGIN_KEYS 对齐
export const PART_TO_VIRGIN_KEY: Record<string, string | null> = {
  'part:vagina': 'virgin_V',
  'part:anus': 'virgin_A',
  'part:urethra': 'virgin_U',
  'part:womb': 'virgin_W',
  'part:mouth': null,
  'part:breast': null,
  'part:clit': null,
}

function hasTag(cmd: CommandDef, prefix: string, value: string): boolean {
  return (cmd.tags ?? []).includes(`${prefix}:${value}`)
}

// 注释：逆推/群交排除链（与部位无关的通用排除）
// category 兜底：指令数据缺 category 时按 sub_category 判断
function excludedByKind(cmd: CommandDef): boolean {
  if (cmd.category !== undefined && cmd.category !== 'sex') return true
  const sub = cmd.sub_category ?? ''
  if (sub === 'item' || sub === 'drug' || sub === 'sm') return true
  return false
}

// 注释：破处过滤——flag:first-time 指令 + 目标部位处女（未破）→ 跳过
function isVirginBlocked(cmd: CommandDef, targetChar: any): boolean {
  if (!hasTag(cmd, 'flag', 'first-time')) return false
  for (const tag of cmd.tags ?? []) {
    const virginKey = PART_TO_VIRGIN_KEY[tag]
    if (virginKey && !targetChar?.first_times?.[virginKey]) return true
  }
  return false
}

// 注释：部位匹配——指令 tags 是否含选中部位对应的 part: tag 之一
function matchesPart(cmd: CommandDef, partTags: string[]): boolean {
  return (cmd.tags ?? []).some(t => partTags.includes(t))
}

// 注释：前提评估（非严格——未知 erark 前提跳过，与 UI evaluatePremises 一致）
function passesPremises(cmd: CommandDef, targetCharId: string): boolean {
  if (!cmd.premises || cmd.premises.length === 0) return true
  return conditionEngine.evaluatePremises(cmd.premises, { ...gameContext.getContext(), selectedCharacterId: targetCharId })
}

// 注释：条件表达式评估（与 command-executor 运行时同上下文——condition 不满足的指令
// 选中后也不会执行，过滤链提前排除保证"选中必执行"一致性，防逆推经验空加）
function passesCondition(cmd: CommandDef): boolean {
  if (!cmd.condition) return true
  try {
    return conditionEngine.evaluate(cmd.condition, gameContext.getContext())
  } catch {
    return false
  }
}

// 注释：筛选 NPC 可执行指令（erArk npc_active_h 过滤链）
// partTags：部位匹配的 part: tag 列表（逆推部位或群交槽位）
// targetChar：被判定角色（破处检查对象 = NPC）
export function filterInstructions(partTags: string[], targetCharId: string): CommandDef[] {
  const targetChar = entitySystem.get('character', targetCharId) as any
  const result: CommandDef[] = []
  for (const cmd of commandRegistry.getAll()) {
    if (cmd.source !== 'instructions') continue
    if (excludedByKind(cmd)) continue
    // 注释：控制类指令（keep_enjoy/change_top_and_bottom/try_pl_active_h 等，flag:control）
    // 排除——erArk 中它们是纯指令（无行为 ID，不在 config_behavior 表），NPC 逆推不会选到；
    // 本引擎指令=行为一体，不排除会自循环（NPC 选 keep_enjoy → 再触发逆推，无限递归）
    if (hasTag(cmd, 'flag', 'control')) continue
    if (hasTag(cmd, 'flag', 'no-active')) continue
    if (targetChar && isVirginBlocked(cmd, targetChar)) continue
    if (!matchesPart(cmd, partTags)) continue
    if (!passesPremises(cmd, targetCharId)) continue
    if (!passesCondition(cmd)) continue
    result.push(cmd)
  }
  return result
}

// 注释：逆推部位 tag 集合（erArk evaluate_npc_body_part_prefs 结果 → 匹配 tag）
export function partTagsOfPartId(partId: number): string[] {
  return PART_ID_TO_TAGS[partId] ?? []
}

// 注释：指令 tag 词表校验（h-npc-ai onEnable 调用）——未知 part:/flag: 值 → warning
// 与 validateInstructionData 现有风格一致：按指令 id 报告（mod.instructions 无路径信息）
export function validateTagVocabulary(): void {
  const mod = modLoader.getMod() as any
  if (!mod?.instructions) return
  for (const inst of mod.instructions as any[]) {
    for (const tag of (inst.tags ?? []) as string[]) {
      const [prefix, value] = tag.split(':')
      if (prefix === 'part' && !(PART_TAGS as readonly string[]).includes(value)) {
        errorReporter.report({
          source: 'h-npc-ai',
          severity: 'warning',
          message: `指令 '${inst.id}' 的 tag '${tag}' 不是合法部位标签（part: 词表：${PART_TAGS.join('/')}）`,
          suggestion: '检查指令 tags——部位标签决定逆推/群交 AI 能否选中该指令',
        })
      }
      if (prefix === 'flag' && !(FLAG_TAGS as readonly string[]).includes(value)) {
        errorReporter.report({
          source: 'h-npc-ai',
          severity: 'warning',
          message: `指令 '${inst.id}' 的 tag '${tag}' 不是合法行为标记（flag: 词表：${FLAG_TAGS.join('/')}）`,
          suggestion: '检查指令 tags——first-time=破处类（逆推对处女跳过），no-active=非逆推类（逆推排除）',
        })
      }
    }
  }
}
