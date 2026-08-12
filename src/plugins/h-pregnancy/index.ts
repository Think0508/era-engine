// 注释：h-pregnancy 插件——妊娠系统，完全对齐 erArk pregnancy.py
// - 排卵周期（7 日循环，第 5 日为排卵日）
// - 受精公式：(精液量/1000)²×100 + 等级×5 + 各类乘数
// - 避孕药检查（body_item[11]事前 / [12]事后）
// - 7 阶段孕期（受精→妊娠→临盆→产后→育儿→完成）
// - 泌乳

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { narrativeLog } from '../../core/narrative-log'
export function onLoad(_ctx: PluginContext): void {
  // 注释：受孕判定——对齐 erArk pregnancy.py get_fertilization_rate + check_fertilization
  // 公式：rate = (semen/1000)² × 100 + semen_level × 5（只取子宫 W(7) 精液，pregnancy.py:45-46）
  // 排卵日（period==5）可受精；催眠强制排卵（hypnosis.force_ovulation）允许非排卵日判定
  // 乘数：排卵促进药 ×5（消耗）→ 催眠排卵 ×5（消耗标志）→ 浓厚精液 ×2（射精方标记）
  effectTypeRegistry.register('pregnancy_check', (_params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char) continue
      checkFertilization(char, ctx.sourceId)
    }
    return true
  })
}

export function onEnable(ctx: PluginContext): void {
  // 注释：监听 h:shoot → 自动触发受孕判定
  eventBus.on('h:shoot', (payload: any) => {
    if (payload?.condom) return  // 避孕套 → 精液不进体内
    // 注释：精液接收方 = payload.target（eja_climax 已确定）；fallback 用遍历
    const targetId = payload?.target ?? getTargetForSemen(payload?.character, payload?.position)
    if (targetId) {
      const targetChar = entitySystem.get('character', targetId) as any
      if (!targetChar) return
      // 注释：射精方 = payload.character（浓厚精液 ×2 判定用，erArk pregnancy.py:81-84
      // pl_character_data.talent[33]）
      checkFertilization(targetChar, payload?.character)
    }
  })

  // 注释：每日推进——排卵周期 + 孕期 + 分娩
  ctx.events.on('game:new_day', () => {
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      // 注释：排卵周期推进（7 日循环 0-6）
      if (!c.base) c.base = {}
      c.base['排卵周期'] = ((c.base['排卵周期'] ?? 0) + 1) % 7

      // 注释：孕期推进
      if (!isPregnant(c)) continue
      c.pregnancy.daysPregnant = (c.pregnancy.daysPregnant ?? 0) + 1
      const dp = c.pregnancy.daysPregnant

      // 注释：erArk 时间线：
      //   day 0-89:   受精期   talent[20]=1
      //   day 90-259: 妊娠期   talent[21]=1, 泌乳开始
      //   day 260+:   临盆期   talent[22]=1, 每日 20% 分娩
      //   分娩后:     产后     talent[23]=1, 2天
      //   产后+2:     育儿     talent[24]=1, 90天
      //   育儿+90:    完成

      if (dp >= 90 && !c.pregnancy.lactation) {
        c.pregnancy.lactation = true
        // 注释：泌乳开始——设置泌乳天赋（erArk pregnancy.py:190 talent[27]=1，涨奶条件）
        if (!c.talents) c.talents = {}
        c.talents['泌乳'] = 1
        // 注释：初始化乳汁字段（对齐 erArk pregnancy.py）
        if (!c.pregnancy.milk) c.pregnancy.milk = 0
        if (!c.pregnancy.milk_max) c.pregnancy.milk_max = calcMilkMax(c)
      }

      if (dp >= 260 && !c.pregnancy.hasGivenBirth && !c.pregnancy.laborStarted) {
        c.pregnancy.laborStarted = true
      }

      if (c.pregnancy.laborStarted && !c.pregnancy.hasGivenBirth) {
        // 注释：每日 20% 分娩概率
        if (Math.random() < 0.2) {
          giveBirth(c)
        }
      }

      // 注释：育儿倒计时
      if (c.pregnancy.hasGivenBirth && c.pregnancy.childcareDaysLeft != null) {
        c.pregnancy.childcareDaysLeft--
        if (c.pregnancy.childcareDaysLeft <= 0) {
          c.pregnancy.childcareComplete = true
          // 注释：育儿完成 → 移除泌乳天赋（erArk pregnancy.py:309 talent[27]=0）
          if (c.talents) delete c.talents['泌乳']
        }
      }
    }
  })

  ctx.api.register('h-pregnancy', {
    isPregnant: (charId: string) => {
      const char = entitySystem.get('character', charId) as any
      return isPregnant(char)
    },
    getDays: (charId: string) => {
      const char = entitySystem.get('character', charId) as any
      return char?.pregnancy?.daysPregnant ?? -1
    },
    getPeriod: (charId: string) => {
      const char = entitySystem.get('character', charId) as any
      return char?.base?.['排卵周期'] ?? 0
    },
    getMilk: (charId: string) => {
      const char = entitySystem.get('character', charId) as any
      return char?.pregnancy?.milk ?? 0
    },
  })

  // 注释：涨奶——对齐 erArk realtime_settle.py:142-146
  // 持有泌乳天赋(talent[27])即涨奶：milk += add_time × 2/3 × (0.8~1.2 随机)，上限 milk_max
  // erArk 在 realtime 结算（每次行动 add_time，非睡眠路径）；此处监听 execution_end
  ctx.events.on('game:execution_end', (payload: any) => {
    // 休息/睡眠不走 realtime 涨奶（erArk 睡眠走 sleep_settle）
    if (payload?.commandId === 'rest' || payload?.commandId === 'sleep') return
    const addTime = payload?.timeCost ?? 10
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (!c?.talents?.['泌乳']) continue
      // 未初始化 pregnancy 的（如未怀孕但有泌乳天赋的 NPC）→ 用完整结构
      if (!c.pregnancy) c.pregnancy = initPregnancyData()
      if (!c.pregnancy.milk_max) c.pregnancy.milk_max = calcMilkMax(c)
      const milkChange = Math.floor(addTime * 2 / 3)
      const addMilk = milkChange > 0
        ? Math.floor(Math.random() * (Math.floor(milkChange * 1.2) - Math.floor(milkChange * 0.8) + 1)) + Math.floor(milkChange * 0.8)
        : 0
      c.pregnancy.milk = Math.min((c.pregnancy.milk ?? 0) + addMilk, c.pregnancy.milk_max)
    }
  })
}

// 注释：受孕判定核心（B8 修复，audit-b I7——pregnancy_check 效果与 h:shoot 双路径收敛共享，
// 对齐 erArk pregnancy.py:33-149）：
// 1. 只取子宫 W(7) 精液（pregnancy.py:45-46，删 V 优先分支）
// 2. 排卵日（period==5）门控；催眠强制排卵（hypnosis.force_ovulation）允许非排卵日判定
//    （erArk TARGET_HYPNOSIS_FORCE_OVULATION_ON 同时置 period=5 + 标志；标志判定后消耗）
// 3. 乘数：排卵促进药 ×5（消耗）→ 催眠排卵 ×5（消耗）→ 浓厚精液 ×2（射精方）
// 4. 清槽同时清 [1]（当前量）与 [2]（等级），pregnancy.py:102-105
function checkFertilization(char: any, shooterId?: string): void {
  if (!char || isPregnant(char)) return
  const period = char.base?.['排卵周期'] ?? 0
  const forceOvulation = char.hypnosis?.force_ovulation === true
  // 注释：仅排卵日可受精；催眠强制排卵允许非排卵日判定
  if (period !== 5 && !forceOvulation) return
  // 注释：只取子宫 W(7) 精液（erArk pregnancy.py:45-46——V 内射不参与受精）
  const semenW = char.body_semen?.[7]?.[1] ?? 0
  if (semenW <= 0) return
  // 注释：避孕药检查（对齐 erArk pregnancy.py:52-59）
  // 事前（槽11）：30 天 expiry 属另一机制（TODO 接线），判定时不消耗
  if (char.body_items?.['11']?.active) return
  // 事后（槽12）：受孕判定时失效（一次有效，pregnancy.py:57-59）
  if (char.body_items?.['12']?.active) {
    delete char.body_items['12']
    return
  }
  // 注释：受精率计算（base = (semen/1000)²×100 + 等级×5）
  const semenCount = char.body_semen[7][1]
  const semenLevel = char.body_semen[7][2] ?? 1
  let rate = Math.pow(semenCount / 1000, 2) * 100 + semenLevel * 5
  // 注释：排卵促进药 ×5，判定后消耗（erArk 03-道具系统.md §2.7）
  if (char.body_items?.['10']?.active) {
    rate *= 5
    delete char.body_items['10']
  }
  // 注释：催眠强制排卵 ×5 + 消耗标志（erArk pregnancy.py:75-79, 108-109）
  if (forceOvulation) {
    rate *= 5
    char.hypnosis.force_ovulation = false
  }
  // 注释：浓厚精液 ×2（erArk pregnancy.py:81-84 pl_character_data.talent[33]——
  // 射精方标记；h_state.thick_semen 与 talents['浓厚精液'] 等价）
  if (shooterId) {
    const shooter = entitySystem.get('character', shooterId) as any
    if (shooter && (shooter.talents?.['浓厚精液'] || shooter.h_state?.thick_semen)) {
      rate *= 2
    }
  }
  rate = Math.min(100, Math.max(0, rate))
  // 注释：清空 W 部位精液当前量与等级（对齐 erArk pregnancy.py:102-105）
  if (char.body_semen?.[7]) {
    char.body_semen[7][1] = 0
    char.body_semen[7][2] = 0
  }
  if (Math.random() * 100 < rate) {
    initPregnancy(char)
    narrativeLog.write(`${char.name ?? char.id} 怀孕了！`, 'system', 'h-pregnancy')
  }
}

// 注释：获取精液的接收目标（对方角色 ID）
function getTargetForSemen(_sourceId: string, _positionId: number): string | null {
  // TODO: 从 combat/当前场景获取精液接收方
  // MVP 简化：遍历所有有 h_state 的非 source 角色
  for (const ch of entitySystem.getAll('character')) {
    const c = ch as any
    if (c.id !== _sourceId && c.h_state?.is_h && c.body_semen) {
      return c.id
    }
  }
  return null
}

function isPregnant(char: any): boolean {
  return char?.pregnancy != null && typeof char.pregnancy.daysPregnant === 'number' && char.pregnancy.daysPregnant >= 0 && !char.pregnancy.complete
}

function initPregnancyData(): any {
  return {
    stage: 0,
    daysPregnant: 0,
    lactation: false,
    hasGivenBirth: false,
    laborStarted: false,
    childcareDaysLeft: null,
    childcareComplete: false,
    complete: false,
    milk: 0,
    milk_max: 0,
  }
}

function initPregnancy(char: any): void {
  char.pregnancy = initPregnancyData()
}

// 注释：乳汁上限计算（对齐 erArk pregnancy.py:194 milk_max = 150 + (talent_id - 121) * 40）
// 胸围天赋 → 上限：贫乳190 / 普乳230 / 巨乳270 / 爆乳310（绝壁121无对应，默认150）
function calcMilkMax(char: any): number {
  const chestMap: Record<string, number> = { '贫乳': 190, '普乳': 230, '巨乳': 270, '爆乳': 310 }
  for (const [talentName, max] of Object.entries(chestMap)) {
    if (char.talents?.[talentName]) return max
  }
  return 150
}

function giveBirth(char: any): void {
  char.pregnancy.hasGivenBirth = true
  char.pregnancy.childcareDaysLeft = 92  // 产后 2 天 + 育儿 90 天
  char.pregnancy.daysPregnant = 0
  // TODO: 创建子角色实体（需角色创建系统支持）
  narrativeLog.write(`${char.name ?? char.id} 分娩了！`, 'system', 'h-pregnancy')
}
