// 注释：绝顶结算（二段结算核心）——精确复刻 erArk Script/Design/second_behavior.py
// orgasm_judge(280-376) + orgasm_settle(376-545) + judge_orgasm_degree(545-580) + judge_orgasm_edge_success(580-620)
//
// 机制：每次 H 内指令执行后，对 H 中角色自动检测各部位快感等级变化 → 触发对应部位绝顶
// 部位状态ID（CharacterState.csv cid，type=0 的快感属性）——只保留我们引擎已实现属性的部位：
//   0=皮肤(s) 1=胸部(b) 2=阴蒂(c) 3=阴茎(p,射精槽跳过) 4=阴道(v) 5=肛肠(a) 7=子宫(w)
//   21=口喉(m) 23=心理(h)
// 注：erArk 的 6=尿道(u)/22=兽部(f) 未实现（无属性/无感度），已从表中移除；
//     erArk 的 5=肛肠(a) 在我们引擎中属性名为"后穴"

import { getEntityAttr } from '../../../core/entity-utils'
import { entitySystem } from '../../../core/entity-system'

// 部位状态ID → 属性名（我们 attributes.toml 的 parameter 命名）
export const ORGASM_PART_ATTR: Record<number, string> = {
  0: '皮肤', 1: '胸部', 2: '阴蒂', 3: '阴茎', 4: '阴道', 5: '后穴',
  7: '子宫', 21: '口喉', 23: '心理',
}

// 属性名 → 部位状态ID（反向映射，供 settle_state/tech_adjust 累积快感变化用）
export const ORGASM_ATTR_TO_PART: Record<string, number> = Object.fromEntries(
  Object.entries(ORGASM_PART_ATTR).map(([id, name]) => [name, Number(id)]),
)

// 注释：插入位置 → 射精部位 body_part cid（erArk 射精部位由 UI 面板选择；
// 我们无射精面板，默认射在当前插入部位。insert_position: -1=无 0=V 1=A 2=U 3=W 4=M）
// body_part cid: 2=口 6=阴道 7=子宫 8=肛 10=尿道 15=胃
export function insertPositionToBodyCid(insertPosition: number): number {
  const map: Record<number, number> = {
    0: 6,  // V → 阴道
    1: 8,  // A → 肛
    2: 10, // U → 尿道
    3: 7,  // W → 子宫
    4: 2,  // M → 口
  }
  return map[insertPosition] ?? 6
}

/**
 * 累积本次指令的快感变化量到 h_state.pending_orgasm_feel
 * （对齐 erArk change_data.status_data[orgasm]：每次快感结算把变化量记入，二段结算时消耗）
 * 由 settle_state / tech_adjust 在写入部位快感后调用
 */
export function accumulateOrgasmFeel(char: any, partId: number, delta: number): void {
  if (!char?.h_state || !delta) return
  if (!char.h_state.pending_orgasm_feel) char.h_state.pending_orgasm_feel = {}
  char.h_state.pending_orgasm_feel[partId] = (char.h_state.pending_orgasm_feel[partId] ?? 0) + delta
}

// 部位 → 感度能力名（强绝顶/超强绝顶需要对应感度等级）
export const ORGASM_PART_SENSITIVITY: Record<number, string> = {
  0: '皮肤感度', 1: '胸部感度', 2: '阴蒂感度', 3: '阴茎感度', 4: '阴道感度',
  5: '后穴感度', 7: '子宫感度', 21: '口喉感度', 23: '心理感度',
}

// erArk part_dict：部位状态ID → 二段行为前缀
const PART_PREFIX: Record<number, string> = {
  0: 's', 1: 'b', 2: 'c', 3: 'p', 4: 'v', 5: 'a', 7: 'w',
  21: 'm', 23: 'h',
}

// 状态等级阈值（Character_State_Level.csv：0→100, 1→500, ... 10→100000）
const STATUS_LEVEL_THRESHOLDS = [0, 100, 500, 1000, 2500, 6000, 12000, 30000, 50000, 75000, 100000]

export interface OrgasmEvent {
  characterId: string
  partId: number
  degree: number        // 0=small 1=normal 2=strong 3=super
  count: number         // 本次高潮次数
  extra: boolean        // 是否额外高潮
}

export interface SecondSettleResult {
  orgasms: OrgasmEvent[]
  pluralCount: number   // 本次同时绝顶部位数（≥2 触发多重绝顶）
  released: boolean     // 寸止失败解放
  shouldEjaculate: boolean  // 玩家射精欲≥上限，应触发 eja_climax
}

/** 状态值 → 等级（对齐 erArk get_status_level） */
export function getStatusLevel(value: number): number {
  for (let i = 0; i < STATUS_LEVEL_THRESHOLDS.length - 1; i++) {
    if (value < STATUS_LEVEL_THRESHOLDS[i + 1]) return i
  }
  return 10
}

/**
 * 高潮程度判定（对齐 erArk judge_orgasm_degree）
 * 小/普/强基础概率 [0.98, 0.02, 0]，每多1次高潮调整概率
 */
export function judgeOrgasmDegree(levelCount: number): number {
  const prob = [0.98, 0.02, 0.0]
  for (let i = 0; i < levelCount - 1; i++) {
    if (prob[0] > 0) {
      prob[0] -= 0.12
      prob[1] += 0.10
      prob[2] += 0.02
    } else {
      prob[1] -= 0.05
      prob[2] += 0.05
    }
    prob[0] = Math.max(0, prob[0])
    prob[1] = Math.max(0, prob[1])
    prob[2] = Math.max(0, prob[2])
  }
  const total = prob[0] + prob[1] + prob[2]
  const r = Math.random() * total
  if (r < prob[0]) return 0
  if (r < prob[0] + prob[1]) return 1
  return 2
}

/**
 * 高潮寸止成功率（对齐 erArk judge_orgasm_edge_success）
 * 次数 ≤ 技巧×3 → 必成功；超出后每次 20% 概率失败
 * @param orgasmEdgeCount 各部位寸止累计次数（平方和）
 * @param skillAbilityLv 玩家技巧等级（ability[30]）
 */
export function judgeOrgasmEdgeSuccess(orgasmEdgeCount: Record<number, number>, skillAbilityLv: number): boolean {
  let allCount = 0
  for (const v of Object.values(orgasmEdgeCount)) {
    allCount += v * v
  }
  const overCount = skillAbilityLv * 3 - allCount
  if (overCount >= 0) return true
  const failRate = 0.2 * -overCount
  return Math.random() >= failRate
}

/**
 * 绝顶结算（对齐 erArk orgasm_settle 的核心逻辑，去掉 UI/成就/人力发电）
 * 对单个角色执行完整二段高潮结算
 *
 * @param charId 角色 ID
 * @param normalOrgasm 各部位普通高潮次数
 * @param extraOrgasm 各部位额外高潮次数
 * @param unCountOrgasm 各部位不计数高潮次数
 * @returns 高潮事件列表 + 多重绝顶信息
 */
export function settleOrgasm(
  charId: string,
  normalOrgasm: Record<number, number>,
  extraOrgasm: Record<number, number>,
  unCountOrgasm: Record<number, number>,
): SecondSettleResult {
  const char = entitySystem.get('character', charId) as any
  const result: SecondSettleResult = { orgasms: [], pluralCount: 0, released: false, shouldEjaculate: false }
  if (!char) return result
  if (!char.h_state) return result
  const hs = char.h_state

  // 初始化 h_state 缺省字段
  if (!hs.orgasm_level) hs.orgasm_level = {}
  if (!hs.extra_orgasm_feel) hs.extra_orgasm_feel = {}
  if (!hs.extra_orgasm_count) hs.extra_orgasm_count = 0
  if (!hs.orgasm_edge_count) hs.orgasm_edge_count = {}
  if (!hs.time_stop_orgasm_count) hs.time_stop_orgasm_count = {}

  let partCount = 0
  const orgasmSet = new Set<number>()

  for (const partId of Object.keys(PART_PREFIX).map(Number)) {
    const orgasm = partId
    if (orgasm === 3) continue // 跳过射精槽

    const preData = hs.orgasm_level[orgasm] ?? 0
    const normalData = normalOrgasm[orgasm] ?? 0
    const extraData = extraOrgasm[orgasm] ?? 0
    const unCountData = unCountOrgasm[orgasm] ?? 0

    let nowData = preData
    if (extraData > 0) {
      nowData = preData + extraData
    } else {
      nowData = preData + normalData
    }

    if (normalData <= 0 && extraData <= 0 && unCountData <= 0) continue

    const climaxCount = normalData + unCountData
    hs.orgasm_level[orgasm] = nowData

    // 时停状态 → 绝顶计入寸止计数（无实际高潮）
    // 对齐 erArk：handle_unconscious_flag_3 = sp_flag.unconscious_h == 3
    if (char.sp_flag?.unconscious_h === 3) {
      hs.time_stop_orgasm_count[orgasm] = (hs.time_stop_orgasm_count[orgasm] ?? 0) + climaxCount
      continue
    }

    // 寸止状态（对齐 erArk：寸止成功率用【玩家】的寸止计数 + 玩家技巧）
    if (hs.orgasm_edge === 1) {
      const pl = entitySystem.get('character', '0') as any ?? entitySystem.get('character', charId) as any
      const skillLv = getEntityAttr(pl, '技巧')
      const plEdgeCount = pl?.h_state?.orgasm_edge_count ?? {}
      const success = judgeOrgasmEdgeSuccess(plEdgeCount, typeof skillLv === 'number' ? skillLv : 0)
      if (!success) {
        // 寸止失败 → 置解放状态，返回部分结果，由 orgasmJudge 重结算（对齐 erArk）
        hs.orgasm_edge = 3
        result.released = true
        return result
      }
      // 寸止成功：玩家寸止计数 +1（erArk：pl 侧 h_state.orgasm_edge_count）
      if (pl?.h_state) {
        if (!pl.h_state.orgasm_edge_count) pl.h_state.orgasm_edge_count = {}
        pl.h_state.orgasm_edge_count[orgasm] = (pl.h_state.orgasm_edge_count[orgasm] ?? 0) + 1
      }
      continue
    }

    partCount += 1
    orgasmSet.add(orgasm)

    // 按概率计算绝顶程度
    for (let i = 0; i < climaxCount; i++) {
      let degree = judgeOrgasmDegree(nowData)

      // 强绝顶需要该部位感度 ≥ 3 级
      if (degree >= 2) {
        const sensName = ORGASM_PART_SENSITIVITY[orgasm]
        const sensLv = sensName ? getSensitivityLevel(char, sensName) : 0
        if (sensLv < 3) degree = 1
      }

      // 解放状态（寸止/时停解放）且次数 ≥ 3 → 超强绝顶
      if ((hs.orgasm_edge === 2 || hs.orgasm_edge === 3) && climaxCount >= 3) {
        degree = 3
        const sensName = ORGASM_PART_SENSITIVITY[orgasm]
        const sensLv = sensName ? getSensitivityLevel(char, sensName) : 0
        if (sensLv < 6) degree = 2
      }

      result.orgasms.push({
        characterId: charId,
        partId: orgasm,
        degree,
        count: 1,
        extra: extraData > 0,
      })
    }

    // B绝顶喷乳（对齐 erArk：pregnancy.milk > 0 且 milk/milk_max > 0.80）
    if (orgasm === 1 && checkMilkRatio(char)) {
      result.orgasms.push({ characterId: charId, partId: orgasm, degree: 3, count: 1, extra: false })
    }
  }

  // 额外高潮计数
  for (const partId of Object.keys(extraOrgasm).map(Number)) {
    const extraData = extraOrgasm[partId] ?? 0
    if (extraData > 0) {
      hs.extra_orgasm_count = (hs.extra_orgasm_count ?? 0) + extraData
    }
  }

  result.pluralCount = partCount
  if (partCount >= 2) {
    hs.plural_orgasm_set = Array.from(orgasmSet)
  }

  return result
}

/**
 * 二段结算主入口（对齐 erArk orgasm_judge）
 * 检测角色各部位快感等级变化 → 计算普通/额外/不计数高潮 → 调用 settleOrgasm
 *
 * @param charId 角色 ID
 * @param statusDelta 兼容参数（已弃用：extra 累积改读 hs.pending_orgasm_feel，由 settle_state/tech_adjust 写入）
 * @returns 结算结果
 */
export function orgasmJudge(charId: string, _statusDelta?: Record<number, number>): SecondSettleResult {
  const char = entitySystem.get('character', charId) as any
  const empty: SecondSettleResult = { orgasms: [], pluralCount: 0, released: false, shouldEjaculate: false }
  if (!char) return empty
  if (!char.h_state) return empty
  const hs = char.h_state

  // 玩家射精判定（erArk orgasm_judge 前半段，character_id==0 时）
  // erArk: eja_point >= eja_point_max → 触发射精（忍耐面板/精液量/强度）
  // 我们：标记 shouldEjaculate，由 h-core 的 execution_end 监听器调 eja_climax
  // （eja_climax 负责射精量/避孕套/污染/事件，见 h-ejaculation）
  // 注：忍耐射精面板交互未实现（erArk 弹窗），强度由 eja_climax 的 level 参数决定
  if (charId === '0' || charId === 'player') {
    const ejaPoint = char.base?.['射精欲'] ?? 0
    const ejaMax = char.base?.['射精欲上限'] ?? 1000
    if (ejaPoint >= ejaMax) {
      empty.shouldEjaculate = true
    }
  }

  const normalOrgasm: Record<number, number> = {}
  const extraOrgasm: Record<number, number> = {}
  const unCountOrgasm: Record<number, number> = {}

  for (const partId of Object.keys(PART_PREFIX).map(Number)) {
    if (partId === 3) continue
    const attrName = ORGASM_PART_ATTR[partId]
    if (!attrName) continue

    const nowLevel = getStatusLevel(getEntityAttr(char, attrName))
    const preData = hs.orgasm_level[partId] ?? 0
    let extraAdd = 0

    normalOrgasm[partId] = 0
    extraOrgasm[partId] = 0
    unCountOrgasm[partId] = 0

    // 饮精绝顶（口喉部位 + 精液位置在体内/胃 + 有精液味觉天赋）
    if (partId === 21 && getTalent(char, '精爱味觉')) {
      const shootPos = hs.shoot_position_body ?? -1
      if (shootPos === 2 || shootPos === 15) {
        unCountOrgasm[partId] = 1
        hs.shoot_position_body = -1
      }
    }

    // 已到10级 → 额外高潮结算（对齐 erArk orgasm_judge 349-367 行）
    // erArk 顺序：extra_orgasm_feel 累积 → 算 extra_add → now_data = pre + extra_add
    //          → normal = now_data - pre_data（即 extra>0 时 normal 被覆盖为 extra_add！）
    // 注：这是 erArk 原逻辑（extra 时 normal 与 extra 双重计数），完整复刻
    if (preData >= 10) {
      const pending = hs.pending_orgasm_feel?.[partId] ?? 0
      hs.extra_orgasm_feel[partId] = (hs.extra_orgasm_feel[partId] ?? 0) + pending
      const extraCount = preData - 10
      let nowThreshold = 20000 * Math.pow(0.9, extraCount)
      nowThreshold = Math.max(1000, nowThreshold)
      extraAdd = Math.floor((hs.extra_orgasm_feel[partId] ?? 0) / nowThreshold)
      hs.extra_orgasm_feel[partId] -= extraAdd * nowThreshold
      hs.extra_orgasm_count = (hs.extra_orgasm_count ?? 0) + extraAdd
      extraOrgasm[partId] = extraAdd
      // erArk：now_data = pre_data + extra_add，normal = now_data - pre_data = extra_add
      if (extraAdd > 0) {
        normalOrgasm[partId] = extraAdd
      }
    }

    // 普通高潮次数（erArk：now_data - pre_data；extra=0 时 = 当前等级 - 前等级）
    if (normalOrgasm[partId] === 0) {
      normalOrgasm[partId] = nowLevel - preData
    }
  }

  // 消耗本次 pending 快感（二段结算后清空，避免下次重复累积）
  if (hs.pending_orgasm_feel && Object.keys(hs.pending_orgasm_feel).length > 0) {
    hs.pending_orgasm_feel = {}
  }

  const result = settleOrgasm(charId, normalOrgasm, extraOrgasm, unCountOrgasm)
  result.shouldEjaculate = empty.shouldEjaculate

  // 饮精绝顶经验（对齐 erArk orgasm_settle 尾部：part_count>=1 且射精位置在口/胃 → 经验111）
  // 注：part_count>=1 即本次有任意部位高潮（非仅多重绝顶）
  if (result.orgasms.length >= 1 && (hs.shoot_position_body === 2 || hs.shoot_position_body === 15)) {
    if (!char.experience) char.experience = {}
    char.experience['111'] = (char.experience['111'] ?? 0) + 1
  }

  // 寸止失败解放 → 重结算（对齐 erArk：orgasm_edge==3 → 置2 → orgasm_settle with orgasm_edge_count）
  if (result.released || hs.orgasm_edge === 3) {
    hs.orgasm_edge = 2
    const retry = settleOrgasm(charId, normalOrgasm, extraOrgasm, hs.orgasm_edge_count ?? {})
    retry.shouldEjaculate = empty.shouldEjaculate
    return retry
  }

  return result
}

/** 读取部位感度等级（abilities 命名空间） */
function getSensitivityLevel(char: any, name: string): number {
  const abl = char.abilities?.[name]
  if (abl && typeof abl === 'object') return abl.level ?? 0
  return typeof abl === 'number' ? abl : 0
}

/** 读取天赋（talents 命名空间） */
function getTalent(char: any, name: string): boolean {
  return !!(char.talents?.[name] ?? 0)
}

/** 乳汁比例检查（对齐 erArk handle_milk_ge_80：pregnancy.milk > 0 且 ratio > 0.80） */
function checkMilkRatio(char: any): boolean {
  const preg = char.pregnancy
  if (!preg || preg.milk === 0) return false
  const max = preg.milk_max ?? 200
  return max > 0 && preg.milk / max > 0.80
}
