import { configureAttributeEval, readEffective, notifyAttrWrite } from './attribute-eval'

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

/** 跨命名空间读取**裸值**（不含派生与修正）——有效值管线的输入 */
export function readRawAttr(entity: any, name: string): any {
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

/** 跨命名空间读取属性值（**有效值**：裸值 → 派生 → 修正栈；未命中闸门时等于裸值）
 *  2026-09-22：接入 src/core/attribute-eval.ts（设计见 docs/superpowers/specs/
 *  2026-09-22-attribute-effective-value-design.md） */
export function getEntityAttr(entity: any, name: string): any {
  return readEffective(entity, name, readRawAttr(entity, name))
}

// 注入裸值读取器：compute 脚本跨属性读取时递归走同一管线（命名空间查找单一来源保留在本文件）
// ⚠️ 上限规则表（capRules）也在这里注入，但必须放在 `ATTR_CAPS` 声明**之后**（见下方）——
//    本文件是属性名表的唯一来源，attribute-eval 是叶子模块不能反向 import。
configureAttributeEval({ rawReader: readRawAttr })

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

/** 跨命名空间写入属性值（写的是**裸值**；写后让该实体的有效值缓存失效） */
export function setEntityAttr(entity: any, name: string, value: any): boolean {
  const ok = writeRawAttr(entity, name, value)
  if (ok) notifyAttrWrite(entity)
  return ok
}

function writeRawAttr(entity: any, name: string, value: any): boolean {
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

// 上限规则表注入有效值层：**读时封顶投影**（`applyCapProjection`）按"该属性是否带 maxAttr"决定
// 是否参与（带 maxAttr 的四项：体力/气力/射精欲/精液量），常量 `cap` 类不受影响（它们在写入端钳制）。
// 注入点必须在 ATTR_CAPS 声明之后（本文件顶部那次注入只给 rawReader——那时 ATTR_CAPS 还在 TDZ）。
configureAttributeEval({ capRules: ATTR_CAPS })

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

/**
 * 属性**增量写入**（原子：读基础值 → 加 delta → 钳制 → 写回基础值）。
 *
 * 为什么必须用它：读属性返回的是**有效值**（基础值 + `compute` 派生 + 修正栈），而写入写的是**基础值**。
 * 任何「读出来加一点再写回去」的代码，只要读的是有效值，就会把修正/派生**烘焙进基础值**，
 * 下次读取再叠一次 —— 无界膨胀（挂 +20 的效果，每次改属性都多烙一遍 +20）。
 * 本函数把这条读-改-写全程锁在基础值域，调用方不可能写错。
 *
 * 规则一句话 —— **要写回哪个值，就从哪个值出发读；白字（基础）会被写，绿字（加成）只用于显示与判断。**
 *
 * 上限有**两种用法**，别混（2026-09-23 末轮：改为"读时封顶"）：
 *   · **判据**（直接调 `clampAttrValue`：结算/UI/恢复速率系数这类「算不算超限、该给多少」）——
 *     必须看**有效**上限：「上限 +500」这类修正的意义就是抬高上限，判超限时必须看到加成后的上限。
 *     `clampAttrValue` 因此保持不变，仍走 `getEntityAttr`。
 *   · **写路径**（本函数）—— **不再按属性上限（`maxAttr`）钳制**：写入端按上限钳制正是 R1/R2 的通道 ——
 *     上限减益下 `min(有效上限, 裸值+增量)` 把裸值截断（base 体力 100 / 上限 120 + `体力上限 −100`
 *     （有效上限 20）→ `recover_permil +50` 把基础体力写成 **20**，撤掉修正仍 20 = 永久 −80），
 *     上限增益下又把裸值抬过基础上限且撤修正后不回落。「不超上限」改由**读时封顶投影**保证
 *     （`attribute-eval.applyCapProjection`：裸值可以越顶，读出来的有效值不会 —— 详见 `docs/attributes-system.md`）。
 *     `opts.clamp` 现在只钳**常量上限**（疲劳 160 / 信赖 300 / 好感 100000 / 饥饿 240 / 尿意 300 /
 *     欲望 100 / 默认 99999），且保留"非负增量绝不减少裸值"守卫（常量上限同样不得反向回收既有裸值）。
 *
 * @param opts.clamp 按 `ATTR_CAPS` 的**常量上限**钳制（默认 false = 纯基础值加减，不引入新上限）
 * @param opts.max   额外固定上限（如 `STAMINA_MAX` 的 9999、`SEMEN_MAX` 的 999）——原样保留
 * @returns `{ old, new }`（均为**基础值**）；实体/增量不可用 → `null`（未写入）。
 *          属性缺失沿用全仓既有「缺失 = 0」约定（`readRawAttr` 返回 0 → 结果为 delta）
 */
export function applyAttrDelta(
  entity: any, name: string, delta: number, opts?: { clamp?: boolean; max?: number },
): { old: number; new: number } | null {
  if (!entity || typeof delta !== 'number' || !Number.isFinite(delta)) return null
  const old = readRawAttr(entity, name)
  if (typeof old !== 'number' || !Number.isFinite(old)) return null
  let next = Math.max(0, old + delta)
  if (typeof opts?.max === 'number') next = Math.min(opts.max, next)
  if (opts?.clamp) {
    // 只钳**常量上限**（带 `maxAttr` 的四项不在写入端钳制——见函数头注释：那是 R1/R2 的通道）
    const rule = ATTR_CAPS[name] ?? ATTR_CAPS._default
    if (typeof rule.cap === 'number') {
      const capped = Math.min(rule.cap, next)
      // 钳制只「限制本次增量的幅度」，不得反向：非负增量以 old 为下界——常量上限同样不得回收既有裸值；
      // `delta === 0` 同理（空转的恢复调用经 floor 后常为 0，它绝不能把高于上限的裸值截断成上限值）。
      next = delta >= 0 ? Math.max(old, capped) : capped
    }
  }
  setEntityAttr(entity, name, next)
  return { old, new: next }
}
