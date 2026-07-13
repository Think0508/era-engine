/** 属性名常量——插件代码引用属性的唯一途径，禁止直接写字符串 */
export const ATTR = {
  // 基础
  HP: '体力', MP: '气力', STAMINA: '精力',
  FATIGUE: '疲劳度', HUNGER: '饥饿值', SLEEP: '熟睡值', URINE: '尿意',
  HP_MAX: '体力上限', MP_MAX: '气力上限',
  DESIRE: '欲望值', EJA_GAUGE: '射精槽', EJA_GAUGE_MAX: '射精槽上限',
  SEMEN: '精液量', SEMEN_MAX: '精液量上限',
  ANGER: '愤怒', ALCOHOL: '酒气',
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
  VAGINA: '阴道', ANUS: '后穴', WOMB: '子宫', THROAT: '口喉', MIND: '心理',
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
const SEARCH_ORDER = [
  'base', 'params', 'flags', 'talents', 'marks', 'abilities',
  'first_record', 'experience', 'social', 'economy', 'combat',
]

/** 判断一个对象是否可能是角色实体（有命名空间结构） */
function isEntity(obj: any): boolean {
  return obj && typeof obj === 'object' && (
    Array.isArray(obj.base) || 
    (obj.base && typeof obj.base === 'object')
  )
}

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

  return false
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
    if (!current[parts[i]]) current[parts[i]] = {}
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
