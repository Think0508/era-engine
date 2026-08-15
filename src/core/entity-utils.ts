/** 属性名常量——插件代码引用属性的唯一途径，禁止直接写字符串 */
export const ATTR = {
  // 基础
  HP: '体力', MP: '气力', STAMINA: '精力', STAMINA_MAX: '精力上限',
  FATIGUE: '疲劳度', HUNGER: '饥饿值', SLEEP: '熟睡值', URINE: '尿意',
  HP_MAX: '体力上限', MP_MAX: '气力上限',
  DESIRE: '欲望值', EJA_GAUGE: '射精欲', EJA_GAUGE_MAX: '射精欲上限',
  SEMEN: '精液量', SEMEN_MAX: '精液量上限', EXTRA_SEMEN: '额外精液量',
  PENIS_SIZE: '阴茎大小',
  ANGER: '愤怒', ALCOHOL: '酒气',
  AGE: '年龄',
  // 情绪
  MOOD: '情绪', REASON: '理性',
  // 性别
  SEX: '性别',
  // 刻印
  MARK_PLEASURE: '快乐刻印', MARK_OBEDIENCE: '屈服刻印',
  MARK_PAIN: '苦痛刻印', MARK_FEAR: '恐怖刻印',
  MARK_REBEL: '反发刻印', MARK_TIMESTOP: '时姦刻印', MARK_VOID: '无觉刻印',
  // 社交
  FAVORABILITY: '好感度', TRUST: '信赖度',
  // 经济
  MONEY: '金钱',
  // PALAM（参数）
  SKIN: '皮肤', BREAST: '胸部', CLITORIS: '阴蒂', PENIS: '阴茎',
  VAGINA: '阴道', ANUS: '后穴', URETHRA: '尿道', WOMB: '子宫', THROAT: '口喉', MIND: '心理',
  LUBE: '润滑', LEARN: '习得', DEFERENCE: '恭顺', FONDNESS: '好意',
  AROUSAL: '欲情', PLEASURE: '快乐', ANTICIPATION: '先导', OBEDIENCE: '屈服',
  SHAME: '羞耻', PAIN: '苦痛', FEAR: '恐怖', DEPRESSION: '抑郁', RESENTMENT: '反感',
  SUPERIORITY: '优越',
  // ABL（能力）
  TECHNIQUE: '技巧', SUBMISSION: '顺从', INTIMACY: '亲密',
  LUST: '欲望', EXPOSURE: '露出', SADISM: '施虐', MASOCHISM: '受虐',
  // 战斗（走绑定系统的通用名）
  ATTACK: 'attack', DEFENSE: 'defense', SPEED: 'speed',
  // 武侠战斗（combat-wuxia 独有，不走绑定）
  STR: '力道', CON: '根骨', WILL: '定力', AGI: '灵敏', FORT: '福缘',
} as const

// 命名空间搜索顺序
// 注意（2026-08-09 契约审查）：marks 排在 abilities 之后——刻印的 canonical 存储是
// abilities（h-mark 按名键写入、calcJudge/settle_state/favorability/trust 全走 abilities）；
// entity.marks 仅是 attributes.toml category=mark 的默认落位 + 条件字典注册镜像（零写入方）。
// marks 若在 abilities 前，getEntityAttr('快乐刻印') 会命中恒 0 的死存储，遮蔽真实刻印等级
// （静默失效地雷——第 4 轮审查消除）
const SEARCH_ORDER = [
  'base', 'params', 'flags', 'talents', 'abilities', 'marks',
  'first_record', 'experience', 'social', 'economy', 'combat',
]

/** 跨命名空间读取属性值 */
export function getEntityAttr(entity: any, name: string): any {
  if (entity === null || entity === undefined) return 0

  // 直接属性（如 entity.name, entity.abilities）
  if (Object.prototype.hasOwnProperty.call(entity, name)) {
    const val = entity[name]
    if (val !== undefined) return val
  }

  // 搜索命名空间
  for (const ns of SEARCH_ORDER) {
    const container = entity[ns]
    if (container && typeof container === 'object') {
      const val = container[name]
      if (val !== undefined) return val
    }
  }

  return 0
}

/** 检查属性是否存在于任一命名空间（区别于 getEntityAttr 的 0 兜底——区分"值为 0"与"不存在"） */
export function hasEntityAttr(entity: any, name: string): boolean {
  if (entity === null || entity === undefined) return false

  if (Object.prototype.hasOwnProperty.call(entity, name)) return true

  for (const ns of SEARCH_ORDER) {
    const container = entity[ns]
    if (container && typeof container === 'object') {
      if (Object.prototype.hasOwnProperty.call(container, name)) return true
    }
  }

  return false
}

/** 跨命名空间写入属性值 */
export function setEntityAttr(entity: any, name: string, value: any): boolean {
  if (!entity) return false

  // 直接属性
  if (Object.prototype.hasOwnProperty.call(entity, name)) {
    entity[name] = value
    return true
  }

  // 搜索命名空间写入
  for (const ns of SEARCH_ORDER) {
    const container = entity[ns]
    if (container && typeof container === 'object') {
      if (Object.prototype.hasOwnProperty.call(container, name)) {
        container[name] = value
        return true
      }
    }
  }

  // 注释：未找到键 → 落 base（2026-08-13 审计——原返回 false 且多数调用方不检查，
  // 属性键缺失（如未跑 applyAttributeDefaults 的角色）时写入静默丢失；
  // 统一落 base（与 binding-resolver 语义一致），保证数据不丢、落位一致）
  if (!entity.base || typeof entity.base !== 'object') entity.base = {}
  entity.base[name] = value
  return true
}

/** 解析嵌套路径（如 "params.恭顺" → entity.params.恭顺） */
export function getEntityPath(entity: any, path: string): any {
  const parts = path.split('.')
  let current = entity
  for (const part of parts) {
    if (current === null || current === undefined) return 0
    if (typeof current !== 'object') return 0
    current = current[part]
  }
  return current !== undefined ? current : 0
}

/** 设值嵌套路径（如 "params.恭顺" → entity.params.恭顺 = value） */
export function setEntityPath(entity: any, path: string, value: any): boolean {
  const parts = path.split('.')
  let current = entity
  for (let i = 0; i < parts.length - 1; i++) {
    // 注释：中间路径非对象时建容器（2026-08-13 审计——原 `!current[parts[i]]` 会把
    // 中间存在的 0/空串等 falsy 值覆盖成 {}，静默破坏数据；仅非对象/null 时重建）
    if (typeof current[parts[i]] !== 'object' || current[parts[i]] === null) {
      current[parts[i]] = {}
    }
    current = current[parts[i]]
  }
  const last = parts[parts.length - 1]
  current[last] = value
  return true
}

/** 根据阈值数组获取等级（纯函数） */
export function getLevel(value: number, thresholds: number[]): number {
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (value >= thresholds[i]) return i
  }
  return 0
}

// ── 属性上限表（era-baseline，ADR-0013）──
// 2026-08-15 审查 C6：effect-system clampValue 与 realtime-settle 内联 caps 双份实现，
// 合并为单表（core 单一来源；数值来自 erArk 复刻决策，改动前读各决策注记）
export interface AttrCapRule {
  /** 固定上限 */
  cap?: number
  /** 上限属性名——读目标实体的该属性作为上限（如 体力上限） */
  maxAttr?: string
}

export const ATTR_CAPS: Record<string, AttrCapRule> = {
  [ATTR.HP]: { maxAttr: ATTR.HP_MAX },
  [ATTR.MP]: { maxAttr: ATTR.MP_MAX },
  [ATTR.EJA_GAUGE]: { maxAttr: ATTR.EJA_GAUGE_MAX },
  [ATTR.SEMEN]: { maxAttr: ATTR.SEMEN_MAX },
  [ATTR.FATIGUE]: { cap: 160 },          // erArk realtime_settle.py 疲劳上限
  [ATTR.TRUST]: { cap: 300 },            // erArk base_chara_favorability_and_trust_common_settle:663/:667
  [ATTR.FAVORABILITY]: { cap: 100000 },  // erArk character_handle.add_favorability:395/:403
  [ATTR.HUNGER]: { cap: 240 },           // erArk realtime_settle.py 饥饿上限
  [ATTR.URINE]: { cap: 300 },            // G6 决策 2026-08-09：代码 min(...,300) 为准（注释 240 矛盾）
  [ATTR.DESIRE]: { cap: 100 },
  // 通用上限（erArk 状态值 clamp，common_default.py:249）
  _default: { cap: 99999 },
}

/** 钳制属性值到有效范围（下限 0，上限查 ATTR_CAPS）——effect-system/realtime-settle 共用（C6） */
export function clampAttrValue(char: any, attr: string, value: number): number {
  let v = Math.max(0, value)
  const rule = ATTR_CAPS[attr] ?? ATTR_CAPS._default
  if (rule.maxAttr) {
    const max = getEntityAttr(char, rule.maxAttr)
    if (typeof max === 'number' && max > 0) v = Math.min(max, v)
  } else if (typeof rule.cap === 'number') {
    v = Math.min(rule.cap, v)
  }
  return v
}
