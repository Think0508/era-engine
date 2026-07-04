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
  // 注释：受孕判定——对齐 erArk pregnancy.py get_fertilization_rate
  // 公式：rate = (semen/1000)² × 100 + semen_level × 5
  // 仅在排卵日（period==5）可受精
  effectTypeRegistry.register('pregnancy_check', (_params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char) continue
      if (isPregnant(char)) continue
      // 注释：仅排卵日可受精
      const period = char.base?.['排卵周期'] ?? 0
      if (period !== 5) continue
      // 注释：检查 V(4) 和 W(7) 部位精液
      const semenV = char.body_semen?.[4]?.[1] ?? 0
      const semenW = char.body_semen?.[7]?.[1] ?? 0
      if (semenV + semenW <= 0) continue
      // 注释：避孕药检查
      if (char.body_items?.['11']?.active || char.body_items?.['12']?.active) continue
      // 注释：受精率计算
      const mainSemen = semenV > 0 ? char.body_semen[4] : char.body_semen[7]
      const semenCount = mainSemen[1]
      const semenLevel = mainSemen[2] ?? 1
      let rate = Math.pow(semenCount / 1000, 2) * 100 + semenLevel * 5
      // 注释：排卵促进药 ×5
      if (char.body_items?.['10']?.active) rate *= 5
      // TODO: 催眠强制排卵 ×5（需 h-hypnosis 子系统）
      // TODO: 浓厚精液 ×2（需 thick_semen 标记）
      rate = Math.min(100, Math.max(0, rate))
      // 注释：清空 V/W 部位精液（对齐 erArk pregnancy.py:102）
      if (char.body_semen?.[4]) char.body_semen[4][1] = 0
      if (char.body_semen?.[7]) char.body_semen[7][1] = 0
      if (Math.random() * 100 < rate) {
        initPregnancy(char)
        narrativeLog.write(`${char.name ?? id} 怀孕了！`, 'system', 'h-pregnancy')
      }
    }
    return true
  })
}

export function onEnable(ctx: PluginContext): void {
  // 注释：监听 h:shoot → 自动触发受孕判定
  eventBus.on('h:shoot', (payload: any) => {
    if (payload?.condom) return  // 避孕套 → 精液不进体内
    if (payload?.character) {
      // 注释：对 target（精液接收方）做 pregnancy_check
      const targetId = getTargetForSemen(payload.character, payload.position)
      if (targetId) {
        entitySystem.get('character', targetId) // 确保存在
        // 直接执行受孕判定
        const targetChar = entitySystem.get('character', targetId) as any
        if (!targetChar || isPregnant(targetChar)) return
        const period = targetChar.base?.['排卵周期'] ?? 0
        if (period !== 5) return
        const semenV = targetChar.body_semen?.[4]?.[1] ?? 0
        const semenW = targetChar.body_semen?.[7]?.[1] ?? 0
        if (semenV + semenW <= 0) return
        if (targetChar.body_items?.['11']?.active || targetChar.body_items?.['12']?.active) return
        const mainSemen = semenV > 0 ? targetChar.body_semen[4] : targetChar.body_semen[7]
        const semenCount = mainSemen[1]
        const semenLevel = mainSemen[2] ?? 1
        let rate = Math.pow(semenCount / 1000, 2) * 100 + semenLevel * 5
        if (targetChar.body_items?.['10']?.active) rate *= 5
        rate = Math.min(100, Math.max(0, rate))
        if (targetChar.body_semen?.[4]) targetChar.body_semen[4][1] = 0
        if (targetChar.body_semen?.[7]) targetChar.body_semen[7][1] = 0
        if (Math.random() * 100 < rate) {
          initPregnancy(targetChar)
          narrativeLog.write(`${targetChar.name ?? targetId} 怀孕了！`, 'system', 'h-pregnancy')
        }
      }
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
        // TODO: 设定奶水积累
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
  })
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

function initPregnancy(char: any): void {
  char.pregnancy = {
    stage: 0,
    daysPregnant: 0,
    lactation: false,
    hasGivenBirth: false,
    laborStarted: false,
    childcareDaysLeft: null,
    childcareComplete: false,
    complete: false,
  }
}

function giveBirth(char: any): void {
  char.pregnancy.hasGivenBirth = true
  char.pregnancy.childcareDaysLeft = 92  // 产后 2 天 + 育儿 90 天
  char.pregnancy.daysPregnant = 0
  // TODO: 创建子角色实体（需角色创建系统支持）
  narrativeLog.write(`${char.name ?? char.id} 分娩了！`, 'system', 'h-pregnancy')
}
