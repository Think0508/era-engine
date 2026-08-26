// 注释：h-core 效果域模块——礼物效果（E2 拆分，2026-08-15）
// 自 index.ts 原样迁出：give_gift。纯重构：handler 逻辑零改动，仅注册位置迁移
// （onLoad 中 registerGiftEffects() 调用点位于原 give_gift 首次注册处，保持注册顺序不变）。

import { effectTypeRegistry } from '../../../core/effect-type-registry'
import { entitySystem } from '../../../core/entity-system'
import { eventBus } from '../../../core/event-bus'
import { modLoader } from '../../../core/mod-loader'
import { ATTR } from '../../../core/entity-utils'
import { calcFavorability } from '../settle/favorability'
import { calcTrust } from '../settle/trust'

export function registerGiftEffects(): void {
  // ═══════════════════════════════════════════════════════════
  // 礼物效果（grill Q7：礼物基础版；erArk 22-礼物与咖啡系统.md §1）
  // ═══════════════════════════════════════════════════════════

  // 注释：give_gift——送礼（mode=favor 好感公式管线 / apology 道歉清愤怒）
  // favor：好感 += calcFavorability(target, favor_base)；talk_multiplier（小×1.5/中×2/大×3）
  //   由 mod 在效果参数提供；若有话术能力（hConfig gift_talk_ability_id 默认"话术技能"）
  //   则再乘 ability_lv_adjust[话术级]。trust_base 有值 → 信赖 += calcTrust(target, trust_base)
  // apology：愤怒=0 + 好感+10 + 好意+10（erArk 道歉礼物 171）
  // drug：由物品 effects 链直接表达，本 effect 不处理
  // mold（倒模）：TODO 未实装（依赖自定义物品生成，后续规划）
  effectTypeRegistry.register('give_gift', async (_p: any, execCtx: any) => {
    const mode = (_p.mode as string) ?? 'favor'
    const targetParam = (_p.target as string) ?? 'selected'
    const targetIds = (execCtx._targetIds as string[]) ?? []
    const targets = targetParam === 'selected'
      ? targetIds
      : targetParam === 'player'
        ? [execCtx.sourceId].filter(Boolean)
        : [targetParam]
    if (targets.length === 0) return true
    if (mode === 'mold' || mode === 'drug') {
      // TODO 倒模礼物（erArk Gift_Items type 13）：目标获得道具 + 好感+100 + 羞耻+100——未实装
      // drug：由物品 effects 链直接表达，本 effect 不处理
      return true
    }
    for (const id of targets) {
      const ch = entitySystem.get('character', id) as any
      if (!ch) continue
      if (mode === 'apology') {
        const angerAttr = (modLoader.getMod()?.hConfig as any)?.gift_anger_attr ?? ATTR.ANGER
        if (ch.base) ch.base[angerAttr] = 0
        // 道歉礼物同时清除“被玩家惹火”标记（erArk 道歉效果 341 同语义）
        if (!ch.sp_flag) ch.sp_flag = {}
        ch.sp_flag.angry_with_player = false
        const favorAttr = (modLoader.getMod()?.hConfig as any)?.favorability_attr ?? ATTR.FAVORABILITY
        const kindnessAttr = (modLoader.getMod()?.hConfig as any)?.kindness_attr ?? ATTR.FONDNESS
        if (ch.base) {
          ch.base[favorAttr] = (ch.base[favorAttr] ?? 0) + 10
          ch.base[kindnessAttr] = (ch.base[kindnessAttr] ?? 0) + 10
        }
        eventBus.emit('character:changed', { id })
        continue
      }
      // favor
      const base = (_p.favor_base as number) ?? 10
      let mult = (_p.talk_multiplier as number) ?? 1
      const mod = modLoader.getMod()
      const talkAbilityId = (mod?.hConfig as any)?.gift_talk_ability_id ?? '话术技能'
      const talkLv = ch.abilities?.[talkAbilityId]?.level ?? 0
      if (talkLv > 0) {
        const adjTable = (mod?.hConfig as any)?.ability_lv_adjust ?? [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
        mult *= adjTable[Math.min(Math.max(0, talkLv), 10)] ?? 4.0
      }
      const favorAttr = (mod?.hConfig as any)?.favorability_attr ?? ATTR.FAVORABILITY
      if (ch.base) {
        ch.base[favorAttr] = (ch.base[favorAttr] ?? 0) + calcFavorability(id, Math.floor(base * mult))
      }
      const trustBase = (_p.trust_base as number) ?? 0
      if (trustBase > 0) {
        const trustAttr = (mod?.hConfig as any)?.trust_attr ?? ATTR.TRUST
        if (ch.base) ch.base[trustAttr] = (ch.base[trustAttr] ?? 0) + calcTrust(id, Math.floor(trustBase * mult))
      }
      eventBus.emit('character:changed', { id })
    }
    return true
  })
}
