// 注释：绝顶结算（二段结算核心）——对齐 erArk Script/Settle/orgasm_settle.py（2026-08-08 更新版）
// orgasm_judge + orgasm_settle_in_second_behavior + judge_orgasm_degree + judge_orgasm_edge_success
// + release_orgasm_edge_now（退出 H / 寸止解放时把累计寸止转成真实高潮——原 erArk 在
// second_behavior.py 内嵌，新版独立文件；行为差异见下）
//
// 2026-08-08 对齐 erArk 更新（orgasm_settle.py）：
//   1. 解放状态（orgasm_edge==2 或 time_stop_release）下 roll_count 压缩：
//      climax>=3 → 0 次普通 roll + 1 次超强绝顶；1-2 → 1 次（原实现每条高潮都 push，解放时
//      累计次数条超强——静默多输出）
//   2. 新增 releaseOrgasmEdge / releaseTimeStopOrgasm（对齐 release_orgasm_edge_now /
//      TIME_STOP_ORGASM_RELEASE）：退出 H 或时停解除时把累计寸止/时停绝顶转成真实结算
//   3. judgeOrgasmEdgeSuccess：失败率 0.2→0.15，补多部位幂修正 success^max(1, k/2)
//   4. 寸止计数归属修正：判定/累计用【被结算角色自己】的 orgasm_edge_count（原误用玩家）
//      ——erArk candidate = 自己累计 + 本次全部部位高潮数，crossed = 本次高潮部位数
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
 * 高潮寸止成功率（对齐 erArk orgasm_settle.py judge_orgasm_edge_success）
 * 次数平方和 ≤ 技巧×3 → 必成功；超出后每次失败率 0.15×超限次数；
 * 多部位同时寸止时成功率按 max(1, 部位数/2) 取幂稀释
 * @param orgasmEdgeCount 各部位寸止累计次数（平方和）
 * @param skillAbilityLv 玩家技巧等级（ability[30]）
 * @param crossedPartCount 本次同时高潮的部位数（≥1）
 */
export function judgeOrgasmEdgeSuccess(
  orgasmEdgeCount: Record<number, number>,
  skillAbilityLv: number,
  crossedPartCount = 1,
): boolean {
  let allCount = 0
  for (const v of Object.values(orgasmEdgeCount)) {
    allCount += v * v
  }
  const overCount = skillAbilityLv * 3 - allCount
  if (overCount >= 0) return true
  // 2026-08-08 对齐：失败率 0.2→0.15（erArk orgasm_settle.py:423），
  // 补多部位幂修正 success_rate = max(0, 1-fail)^max(1, k/2)（:424-426）
  const failRate = 0.15 * -overCount
  const successRate = Math.max(0.0, 1 - failRate) ** Math.max(1, crossedPartCount / 2)
  return Math.random() >= 1 - successRate
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

  // 注释：本次有高潮的部位列表（寸止判定用——erArk candidate 含全部部位、crossed 取全部数）
  const workingParts: number[] = []
  for (const partId of Object.keys(PART_PREFIX).map(Number)) {
    if (partId === 3) continue
    const n = normalOrgasm[partId] ?? 0
    const e = extraOrgasm[partId] ?? 0
    const u = unCountOrgasm[partId] ?? 0
    if (n > 0 || e > 0 || u > 0) workingParts.push(partId)
  }
  const crossedPartCount = workingParts.length

  // 注释：寸止一次判定（erArk orgasm_settle_in_second_behavior——判定在主循环前执行一次）：
  //   candidate = 被结算角色自己累计 + 本次全部部位高潮数（normal + un_count），快照语义；
  //   crossed = 本次高潮部位数；技巧等级用玩家。
  //   成功 → 各寸止部位计数累计（循环内处理）；失败 → 置解放过渡态由 orgasmJudge 重结算。
  // 2026-08-08 审查修正：原逐部位判定——后续部位的 candidate 含前部位刚写入的计数，
  //   与 erArk 快照不一致（超限边界的失败概率偏差）
  const inTimeStop = char.sp_flag?.unconscious_h === 3
  let edgeSuccessFlag = true
  if (hs.orgasm_edge === 1 && crossedPartCount > 0 && !inTimeStop) {
    const player = entitySystem.get('character', '0') as any ?? entitySystem.get('character', 'player') as any
    // 注释：技巧等级按名读 abilities（存 {level, xp} 对象）——2026-08-08 审查修复：
    // 原 getEntityAttr 返回对象（typeof !== number → 0），寸止判定技巧恒 0（静默偏差）
    const skillAb = player?.abilities?.['技巧']
    const skillLv = skillAb && typeof skillAb === 'object'
      ? (skillAb.level ?? 0)
      : (typeof skillAb === 'number' ? skillAb : 0)
    const candidate: Record<number, number> = { ...hs.orgasm_edge_count }
    for (const wp of workingParts) {
      candidate[wp] = (candidate[wp] ?? 0) + (normalOrgasm[wp] ?? 0) + (unCountOrgasm[wp] ?? 0)
    }
    edgeSuccessFlag = judgeOrgasmEdgeSuccess(candidate, skillLv, crossedPartCount)
    if (!edgeSuccessFlag) {
      // 寸止失败 → 置解放过渡态，返回部分结果，由 orgasmJudge 重结算（对齐 erArk：
      // 历史累计 + 本次 un_count 转解放；本次 normal 丢弃（orgasm_level 未更新，下次补算））
      hs.orgasm_edge = 3
      result.released = true
      return result
    }
  }

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

    // 寸止状态：判定已在循环前完成（edgeSuccessFlag——失败已 return，走到这里必为成功）：
    // 计数累计到被结算角色自己（erArk：character_data.h_state.orgasm_edge_count += climax）
    if (hs.orgasm_edge === 1) {
      hs.orgasm_edge_count[orgasm] = (hs.orgasm_edge_count[orgasm] ?? 0) + climaxCount
      continue
    }

    partCount += 1
    orgasmSet.add(orgasm)

    // 注释：h_state.orgasm_count 记录 + 绝顶经验（erArk ADD_1_XClimax_EXPERIENCE，Second_effect.py）：
    //   - orgasm_count[part][0]/[1] 同步 +1（[0]=本次 H 单次累计，[1]=累计；h-mark 刻印升级 /
    //     h-group-sex 结束奖励读取）
    //   - 绝顶经验：部位累计（0-7→10-17、21→156、23→158）+ 总累计 20
    //   - 无意识/时停解放（非玩家）时 type2 经验额外转 78（无意识绝顶，common_default.py:925-935，
    //     原 id 照加）
    // 2026-08-08 修复：原只写 orgasm_count，绝顶经验从无写入 → h-mark 快乐/无觉刻印累计分支与
    // talk-common 绝顶经验条件静默失效
    const PART_EXP_ID: Record<number, number> = {
      0: 10, 1: 11, 2: 12, 4: 14, 5: 15, 7: 17, 21: 156, 23: 158,
    }
    const recordOrgasmCount = (): void => {
      if (!hs.orgasm_count) hs.orgasm_count = {}
      if (!hs.orgasm_count[orgasm]) hs.orgasm_count[orgasm] = [0, 0]
      hs.orgasm_count[orgasm][0] = (hs.orgasm_count[orgasm][0] ?? 0) + 1
      hs.orgasm_count[orgasm][1] = (hs.orgasm_count[orgasm][1] ?? 0) + 1
      if (!char.experience) char.experience = {}
      const partExpId = PART_EXP_ID[orgasm]
      const unconscious = (char.sp_flag?.unconscious_h ?? 0) >= 1 || !!hs.time_stop_release
      if (partExpId !== undefined) {
        char.experience[String(partExpId)] = (char.experience[String(partExpId)] ?? 0) + 1
      }
      char.experience['20'] = (char.experience['20'] ?? 0) + 1
      if (unconscious && char.id !== '0' && char.id !== 'player') {
        char.experience['78'] = (char.experience['78'] ?? 0) + 1
      }
    }

    // 解放状态（寸止解放 orgasm_edge==2/3 或 时停解放 time_stop_release）→ roll_count 压缩
    // erArk orgasm_settle.py：release_flag 时 climax>=3 → 0 次普通 roll + 1 次超强绝顶；1-2 → 1 次；
    // 非解放 → 每次高潮 1 条（2026-08-08 对齐：原解放时也按 climaxCount 条输出）
    const releaseFlag = hs.orgasm_edge === 2 || hs.orgasm_edge === 3 || !!hs.time_stop_release
    const rollCount = releaseFlag ? (climaxCount >= 3 ? 0 : 1) : climaxCount
    for (let i = 0; i < rollCount; i++) {
      let degree = judgeOrgasmDegree(nowData)

      // 强绝顶需要该部位感度 ≥ 3 级
      if (degree >= 2) {
        const sensName = ORGASM_PART_SENSITIVITY[orgasm]
        const sensLv = sensName ? getSensitivityLevel(char, sensName) : 0
        if (sensLv < 3) degree = 1
      }

      result.orgasms.push({
        characterId: charId,
        partId: orgasm,
        degree,
        count: 1,
        extra: extraData > 0,
      })
      recordOrgasmCount()
    }

    // 解放状态且次数 ≥ 3 → 超强绝顶（erArk：感度 < 6 → 降为强）
    if (releaseFlag && climaxCount >= 3) {
      let degree = 3
      const sensName = ORGASM_PART_SENSITIVITY[orgasm]
      const sensLv = sensName ? getSensitivityLevel(char, sensName) : 0
      if (sensLv < 6) degree = 2
      result.orgasms.push({
        characterId: charId,
        partId: orgasm,
        degree,
        count: 1,
        extra: extraData > 0,
      })
      recordOrgasmCount()
    }

    // B绝顶喷乳（对齐 erArk：pregnancy.milk > 0 且 milk/milk_max > 0.80）
    // 注：喷乳是独立行为（b_orgasm_to_milk），不计入 orgasm_count（erArk 同）
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
 * 释放寸止累计（对齐 erArk release_orgasm_edge_now，orgasm_settle.py:333-355）
 * 退出 H / 寸止解放时调用：角色处于寸止状态（orgasm_edge != 0）→ 置解放状态，
 * 把累计的寸止计数转成"不计数高潮"真实结算（数值+事件；解放状态走 roll_count 压缩
 * 与超强绝顶分支），然后清空计数。
 * 2026-08-08 新增：原引擎退出 H 直接清 h_state，寸止成功累计的绝顶被静默丢弃。
 * @returns 释放产生的高潮事件（orgasms 为空 = 未在寸止状态，无结算）
 */
export function releaseOrgasmEdge(charId: string): SecondSettleResult {
  const empty: SecondSettleResult = { orgasms: [], pluralCount: 0, released: false, shouldEjaculate: false }
  const char = entitySystem.get('character', charId) as any
  if (!char?.h_state) return empty
  const hs = char.h_state
  // 未在寸止状态 → 直接返回（erArk :341-343）
  if ((hs.orgasm_edge ?? 0) === 0) return empty
  // 置解放状态（release_flag 生效 → roll_count 压缩 + ≥3 超强绝顶）
  hs.orgasm_edge = 2
  const result = settleOrgasm(charId, {}, {}, hs.orgasm_edge_count ?? {})
  // 清空寸止计数（erArk 置 0 保留键）
  for (const key of Object.keys(hs.orgasm_edge_count ?? {})) {
    hs.orgasm_edge_count[key] = 0
  }
  return result
}

/**
 * 释放时停累计绝顶（对齐 erArk TIME_STOP_ORGASM_RELEASE effect，default.py:6764-6800）
 * 时停解除时调用：把时停中累计的绝顶（time_stop_orgasm_count）转成真实高潮结算
 * （置 time_stop_release 解放标志 → release_flag 生效 → 压缩/超强分支），然后清空计数。
 * @returns 释放产生的高潮事件（orgasms 为空 = 无时停累计）
 */
export function releaseTimeStopOrgasm(charId: string): SecondSettleResult {
  const empty: SecondSettleResult = { orgasms: [], pluralCount: 0, released: false, shouldEjaculate: false }
  const char = entitySystem.get('character', charId) as any
  if (!char?.h_state) return empty
  const hs = char.h_state
  const counts = hs.time_stop_orgasm_count ?? {}
  if (Object.keys(counts).length === 0) return empty
  // 置时停解放标志（erArk：time_stop_release = True）
  hs.time_stop_release = true
  const result = settleOrgasm(charId, {}, {}, counts)
  // 清空时停累计（erArk 置 0 保留键）
  for (const key of Object.keys(counts)) {
    counts[key] = 0
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

  // 玩家射精判定（erArk orgasm_judge 前半段，orgasm_settle.py:43-61）
  // erArk: eja_point >= eja_point_max → 触发射精（忍耐面板/精液量/强度）
  // 我们：标记 shouldEjaculate，由 h-core 的 execution_end 监听器调 eja_climax
  // （eja_climax 负责射精量/避孕套/污染/事件，见 h-ejaculation）
  // 注：忍耐射精面板交互未实现（erArk 弹窗），强度由 eja_climax 的 level 参数决定
  // 2026-08-08 修复：精液量+额外 ≤ 2ml → 无精液高潮（p_no_semen_climax）——
  // 绝顶但不射精：射精欲归零、忍耐计数清零（erArk orgasm_settle.py:52-59）
  if (charId === '0' || charId === 'player') {
    const ejaPoint = char.base?.['射精欲'] ?? 0
    const ejaMax = char.base?.['射精欲上限'] ?? 1000
    if (ejaPoint >= ejaMax) {
      const semen = (char.base?.['精液量'] ?? 0) + (char.base?.['额外精液量'] ?? 0)
      if (semen <= 2) {
        char.base['射精欲'] = 0
        if (hs) hs.endure_not_shoot_count = 0
      } else {
        empty.shouldEjaculate = true
      }
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
    //          → normal = now_data - pre_data = extra_add（无条件覆盖——extra_add=0 时 normal 也为 0）
    // 2026-08-08 审查修正：原只在 extraAdd>0 时覆盖，extraAdd=0 会回落到"当前等级-记录等级"
    //   → 10 级后快感续涨但未到 extra 阈值时错误触发普通高潮（erArk 此时不触发，等 extra 累积）
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
      normalOrgasm[partId] = extraAdd
    } else {
      // 普通高潮次数（erArk：now_data - pre_data；10 级以下 = 当前等级 - 前等级）
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

  // 寸止失败解放 → 重结算（对齐 erArk：orgasm_edge==3 → 置2 → orgasm_settle with 累计寸止）
  // 2026-08-08 审查修正：
  //   - 只传累计寸止 + 本次 un_count（原把本次 normal 也传入 → orgasm_level 多计；
  //     erArk 失败时本次 normal 丢弃——orgasm_level 未更新，下次结算补算等级差）
  //   - 结算后清空计数（原不清 → 退出 H 时 releaseOrgasmEdge 二次释放 = 双倍结算）
  if (result.released || hs.orgasm_edge === 3) {
    hs.orgasm_edge = 2
    const unCount: Record<number, number> = { ...hs.orgasm_edge_count }
    for (const key of Object.keys(hs.orgasm_edge_count)) hs.orgasm_edge_count[key] = 0
    for (const key of Object.keys(unCountOrgasm).map(Number)) {
      unCount[key] = (unCount[key] ?? 0) + (unCountOrgasm[key] ?? 0)
    }
    const retry = settleOrgasm(charId, {}, {}, unCount)
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
