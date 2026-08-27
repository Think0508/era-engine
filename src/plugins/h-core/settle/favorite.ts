// 注释：喜欢的体位/部位偏好模块（2026-08-25 grill 定稿）
// 设计要点（实现铁律）：
// - 每角色一份 favorite.positions / favorite.parts（score map，键为字符串）；
// - 分数 >= 阈值 → 视为“喜欢”，可多个；
// - 快感：谁有该喜好，谁自己的快感结算加成；双方都有则各自加；
// - 判定：只看客体/被判定方的喜欢列表，发起方喜欢不参与；
// - 默认身体侧 = 女体锚定（body_side=female），mod 可全局覆盖。
//
// 键约定：
// - positions：体位 ID 数字转字符串（"1".."12"）
// - parts：女体部位用 BODY_PART_CID 数字转字符串（"2"口/"3"胸/"4"阴蒂/"6"阴道/"7"子宫/
//   "8"后穴/"9"脚/"13"臀），心理用虚拟键 "mental"

import { modLoader } from '../../../core/mod-loader'
import { eventBus } from '../../../core/event-bus'
import { entitySystem } from '../../../core/entity-system'

/** 默认可成为“喜欢的部位”的键集合（mod 可扩展，但扩展只影响 mod 数据/标签，不强制） */
export const DEFAULT_FAVORITE_PARTS: ReadonlySet<string> = new Set([
  '2', '3', '4', '6', '7', '8', '9', '13', 'mental',
])

/**
 * 旧版“体位喜好天赋”→ 体位 ID 的静态映射（2026-08-25 清理 favorite_position 字段后保留，
 * 仅用于旧存档/旧数据迁移和 legacy position.ts；新系统不再消费这个字段）。
 */
export const LEGACY_FAVORITE_POSITION_TALENTS: Record<string, number> = {
  '正常位喜好': 1,
  '背后位喜好': 2,
  '对面骑乘位喜好': 3,
  '背面骑乘位喜好': 4,
  '对面座位喜好': 5,
  '背面座位喜好': 6,
  '对面立位喜好': 7,
  '背面立位喜好': 8,
  '对面抱位喜好': 9,
  '背面抱位喜好': 10,
  '对面卧位喜好': 11,
  '背面卧位喜好': 12,
}

/** 部位显示名（口语名；内部键仍为数字/mental） */
export const PART_DISPLAY_NAMES: Record<string, string> = {
  '2': '口',
  '3': '胸部',
  '4': '阴蒂',
  '6': '小穴',
  '7': '子宫',
  '8': '后穴',
  '9': '脚',
  '13': '臀部',
  'mental': '心理',
}

/** 体位 ID → 显示名（来自 hConfig.sex_positions，缺省 `体位${id}`） */
export function getPositionDisplayName(positionId: number, mod: any = modLoader.getMod()): string {
  const hc = (mod?.hConfig as any) ?? {}
  const posDef = hc.sex_positions?.[positionId] as { name?: string } | undefined
  return posDef?.name ?? `体位${positionId}`
}

/** 部位键 → 显示名（缺省 `部位${key}`） */
export function getPartDisplayName(partKey: string): string {
  return PART_DISPLAY_NAMES[partKey] ?? (partKey === 'mental' ? '心理' : `部位${partKey}`)
}

/** part: 指令标签 → favorite.parts 键（与 h-npc-ai 词表对齐 + 预留扩展） */
export const PART_TAG_TO_KEY: Record<string, string> = {
  breast: '3',
  clit: '4',
  mouth: '2',
  vagina: '6',
  anus: '8',
  womb: '7',
  foot: '9',
  butt: '13',
  mental: 'mental',
  // 尿道不在默认喜欢集，但 mod 扩展时可用
  urethra: '10',
}

/** h_state.insert_position（0=V 1=A 2=U 3=W 4=M 5-12=侍奉位）→ favorite.parts 键 */
export const INSERT_POSITION_TO_PART_KEY: Record<number, string> = {
  0: '6',
  1: '8',
  2: '10',
  3: '7',
  4: '2',
  5: '0',
  6: '1',
  7: '3',
  8: '4',
  9: '5',
  10: '10',
  11: '11',
  12: '15',
}

/** 中文部位名/属性名 → favorite.parts 键（tech_adjust 的 part 参数用中文名） */
export const PART_NAME_TO_KEY: Record<string, string> = {
  皮肤: '0',
  头发: '0',
  面: '1',
  脸: '1',
  嘴: '2',
  口腔: '2',
  口: '2',
  胸: '3',
  胸部: '3',
  乳房: '3',
  阴蒂: '4',
  手: '5',
  阴道: '6',
  穴: '6',
  子宫: '7',
  肛: '8',
  后穴: '8',
  脚: '9',
  尿道: '10',
  腿: '11',
  腰: '12',
  臀部: '13',
  臀: '13',
  背: '14',
  胃: '15',
  耳: '16',
  腋: '17',
  全身: '18',
  心理: 'mental',
}

export interface FavoriteConfig {
  position_threshold: number
  part_threshold: number
  position_feel_bonus: number
  position_judge_bonus: number
  part_feel_bonus: number
  part_judge_bonus: number
  body_side: string
}

export function getFavoriteConfig(mod: any = modLoader.getMod()): FavoriteConfig {
  const fav = (mod?.hConfig as any)?.favorite ?? {}
  return {
    position_threshold: typeof fav.position_threshold === 'number' ? fav.position_threshold : 100,
    part_threshold: typeof fav.part_threshold === 'number' ? fav.part_threshold : 1000,
    position_feel_bonus: typeof fav.position_feel_bonus === 'number' ? fav.position_feel_bonus : 0.5,
    position_judge_bonus: typeof fav.position_judge_bonus === 'number' ? fav.position_judge_bonus : 30,
    part_feel_bonus: typeof fav.part_feel_bonus === 'number' ? fav.part_feel_bonus : 0.2,
    part_judge_bonus: typeof fav.part_judge_bonus === 'number' ? fav.part_judge_bonus : 10,
    body_side: typeof fav.body_side === 'string' ? fav.body_side : 'female',
  }
}

function ensureFavorite(char: any): void {
  if (!char) return
  if (!char.favorite) char.favorite = {}
  if (!char.favorite.positions) char.favorite.positions = {}
  if (!char.favorite.parts) char.favorite.parts = {}
}

/** 读取某角色的喜欢体位分数 map */
export function getFavoritePositions(ch: any): Record<string, number> {
  ensureFavorite(ch)
  return ch.favorite.positions
}

/** 读取某角色的喜欢部位分数 map */
export function getFavoriteParts(ch: any): Record<string, number> {
  ensureFavorite(ch)
  return ch.favorite.parts
}

/** 当前“喜欢”的体位 ID 列表（分数 >= 阈值，按分数降序） */
export function favoritePositionIds(ch: any): number[] {
  const cfg = getFavoriteConfig()
  const scores = getFavoritePositions(ch)
  return Object.entries(scores)
    .filter(([, v]) => v >= cfg.position_threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => Number(k))
}

/** 当前“喜欢”的部位键列表（分数 >= 阈值，按分数降序） */
export function favoritePartKeys(ch: any): string[] {
  const cfg = getFavoriteConfig()
  const scores = getFavoriteParts(ch)
  return Object.entries(scores)
    .filter(([, v]) => v >= cfg.part_threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
}

export function isFavoritePosition(ch: any, positionId: number): boolean {
  if (!ch || typeof positionId !== 'number') return false
  return favoritePositionIds(ch).includes(positionId)
}

export function isFavoritePart(ch: any, partKey: string): boolean {
  if (!ch || !partKey) return false
  return favoritePartKeys(ch).includes(partKey)
}

/** 面板/列表用：把角色的喜欢的体位/部位拼成可读文本（按分数降序、“、”连接） */
export function describeFavorites(ch: any, mod: any = modLoader.getMod()): string {
  if (!ch) return '暂无喜欢的体位/部位'
  const posNames = favoritePositionIds(ch).map(id => getPositionDisplayName(id, mod))
  const partNames = favoritePartKeys(ch).map(getPartDisplayName)
  const posText = posNames.length > 0 ? posNames.join('、') : '暂无'
  const partText = partNames.length > 0 ? partNames.join('、') : '暂无'
  if (posNames.length === 0 && partNames.length === 0) return '暂无喜欢的体位/部位'
  return `喜欢的体位：${posText}；喜欢的部位：${partText}`
}

/**
 * 判断某部位的“身体侧”是否允许用于该角色的喜欢部位命中。
 * - body_side='female'（默认）：只认可女体部位（默认喜欢集就是女体集）；
 * - 'own'：认可角色自己身体上的部位；
 * - 'partner'：认可对方身体上的部位；
 * - 'male'：只认可男体部位（默认集不含男体，由 mod 扩展）。
 */
export function favoritePartApplies(_ch: any, _partKey: string): boolean {
  const cfg = getFavoriteConfig()
  const side = cfg.body_side
  // 引擎默认 body_side=female；mod 扩展的部位键也应当命中（不再用默认集限制）
  if (side === 'own') return true
  if (side === 'partner') return true
  if (side === 'female') return true
  if (side === 'male') return false // 默认无男体部位键；如需男体偏好请用 own/partner + mod 数据
  return true
}

/** 暴露给其他模块：把显式部位名/tag 归一化为 favorite.parts 键（解析不出返回 null） */
export function resolvePartKey(input: string | number | undefined | null): string | null {
  if (input === undefined || input === null) return null
  if (typeof input === 'number') return String(input)
  if (/^\d+$/.test(input) || input === 'mental') return input
  const key = PART_NAME_TO_KEY[input] ?? PART_TAG_TO_KEY[input] ?? null
  return key
}

/** 从 h_state 插入位置推断当前女体部位键（无插入 → null） */
export function actionPartKeyFromHState(ch: any): string | null {
  const pos = ch?.h_state?.insert_position
  if (typeof pos === 'number' && pos >= 0 && INSERT_POSITION_TO_PART_KEY[pos] !== undefined) {
    return INSERT_POSITION_TO_PART_KEY[pos]
  }
  // 自己没记录插入位置时，回退看交互对象（解决“男角被女体部位服务”时男角 h_state 无插入位的场景）
  const partnerId = ch?.h_state?.target_character_id
  if (partnerId) {
    const partner = entitySystem.get('character', partnerId) as any
    const ppos = partner?.h_state?.insert_position
    if (typeof ppos === 'number' && ppos >= 0 && INSERT_POSITION_TO_PART_KEY[ppos] !== undefined) {
      return INSERT_POSITION_TO_PART_KEY[ppos]
    }
  }
  return null
}

/** 给某角色的喜欢部位/体位分数 +1（每次使用；调用方保证 key 合法） */
export function addFavoriteScore(ch: any, kind: 'positions' | 'parts', key: string): void {
  if (!ch || !key) return
  ensureFavorite(ch)
  const map = ch.favorite[kind]
  if (!map || typeof map !== 'object') return
  map[key] = (map[key] ?? 0) + 1
  // 通知 UI/其他系统分数变化（面板按需读取 getFavoriteList）
  eventBus.emit('character:changed', { id: ch.id })
}

/**
 * 记录一次“部位使用”：双方 favorite.parts 分数 +1，并向 counter-system 发 h:part_use。
 * actor=主动方/发起者，target=被作用方/受体。partNum 为女体部位数字；非数字（如 mental）只计分数。
 * 这是“喜欢的部位”学习的统一入口（h-core execution_end 与 tech_adjust 共用，避免散写）。
 */
export async function recordPartUseAndScore(actorId: string, targetId: string, partKey: string, partNum: number | null): Promise<void> {
  const actor = entitySystem.get('character', actorId) as any
  const target = entitySystem.get('character', targetId) as any
  if (actorId === targetId) {
    // 自慰/自我服务：只计一次分数，发一条通用 h:part_use（避免双侧双算）
    if (actor) addFavoriteScore(actor, 'parts', partKey)
    if (partNum !== null && Number.isFinite(partNum)) {
      await eventBus.emit('h:part_use', { target: actorId, partner: actorId, part: partNum, position: partNum })
    }
    return
  }
  if (actor) addFavoriteScore(actor, 'parts', partKey)
  if (target) addFavoriteScore(target, 'parts', partKey)
  if (partNum === null || !Number.isFinite(partNum)) return
  const actorGender = actor?.base?.['性别'] ?? 0
  const targetGender = target?.base?.['性别'] ?? 0
  const payload = { part: partNum, position: partNum }
  if (actorGender === 1 && targetGender === 2) {
    await eventBus.emit('h:part_use', { target: targetId, character: actorId, ...payload })
    await eventBus.emit('h:part_use', { target: actorId, partner: targetId, ...payload })
  } else if (actorGender === 2 && targetGender === 1) {
    await eventBus.emit('h:part_use', { target: actorId, character: targetId, ...payload })
    await eventBus.emit('h:part_use', { target: targetId, partner: actorId, ...payload })
  } else {
    await eventBus.emit('h:part_use', { target: actorId, partner: targetId, ...payload })
    await eventBus.emit('h:part_use', { target: targetId, partner: actorId, ...payload })
  }
}

/**
 * 迁移旧数据（2026-08-25 定稿：废弃旧单一 favorite_position 字段/天赋，全量迁移）：
 * - 旧体位经验 141-152 >= 100 → 写入 favorite.positions；
 * - 旧天赋定义中带 favorite_position 且角色拥有该天赋 → 同样写入（分数=阈值=100）。
 * 幂等：已有分数只取最大值。
 */
export function migrateLegacyFavoritePosition(ch: any, mod: any): void {
  if (!ch) return
  ensureFavorite(ch)
  const cfg = getFavoriteConfig(mod)
  const targetScore = cfg.position_threshold
  // 1. 旧体位经验（experience 141-152）
  const exp = ch.experience ?? {}
  for (let i = 141; i <= 152; i++) {
    const v = exp[String(i)] ?? 0
    if (v >= cfg.position_threshold) {
      const posKey = String(i - 140)
      const cur = ch.favorite.positions[posKey] ?? 0
      ch.favorite.positions[posKey] = Math.max(cur, targetScore)
    }
  }
  // 2. 旧 favorite_position 天赋（静态映射，不再依赖 talents.toml 的 favorite_position 字段）
  for (const [talentId, posId] of Object.entries(LEGACY_FAVORITE_POSITION_TALENTS)) {
    if (ch.talents?.[talentId]) {
      const posKey = String(posId)
      const cur = ch.favorite.positions[posKey] ?? 0
      ch.favorite.positions[posKey] = Math.max(cur, targetScore)
      // 迁移后移除旧天赋标志（废弃旧单一字段）
      delete ch.talents[talentId]
    }
  }
}