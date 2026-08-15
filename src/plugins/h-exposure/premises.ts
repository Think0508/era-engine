// 注释：h-exposure 前提注册模块（index.ts 拆分）
// 职责：露出相关前提（erArk 原名全集——constant_promise.py:1664-1689）
// 命名语义（erArk 惯例）：无前缀=自己（发起者/被判定者）、TARGET_=目标（选中）、PLAYER_=玩家
// 2026-08-15 对齐：原自造名 EXPOSURE_SEX_MODE_*/SELF_*/TARGET_EXPOSURE_* 已删除（零消费方），
// h-core pendingFalse 占位（EXHIBITIONISM_SEX_MODE_1~4 恒 false）同步移除（premise-instruct.ts）
// 注册方式：conditionEngine.registerPremise 直注册（适配统一条件引擎，handler 收完整 GameContext：
// sourceId=自己、selectedCharacterId=目标、player=玩家；不复制旧 api.call 缝合写法）

import { conditionEngine } from '../../core/condition-engine'
import type { GameContext } from '../../core/types'
import { getMode } from './scene'

function selfId(ctx: GameContext): string | null {
  return ctx.sourceId ?? ctx.player?.id ?? null
}

function targetId(ctx: GameContext): string | null {
  return ctx.selectedCharacterId ?? null
}

export function registerExposurePremises(): void {
  const selfMode = (ctx: GameContext): number => {
    const id = selfId(ctx)
    if (!id) return 0
    return getMode(id)
  }
  const targetMode = (ctx: GameContext): number => {
    const id = targetId(ctx)
    if (!id) return 0
    return getMode(id)
  }

  // 自己维度
  conditionEngine.registerPremise('EXHIBITIONISM_SEX_MODE_0', (ctx: GameContext) => selfMode(ctx) === 0)
  conditionEngine.registerPremise('EXHIBITIONISM_SEX_MODE_GE_1', (ctx: GameContext) => selfMode(ctx) >= 1)
  conditionEngine.registerPremise('EXHIBITIONISM_SEX_MODE_1', (ctx: GameContext) => selfMode(ctx) === 1)
  conditionEngine.registerPremise('EXHIBITIONISM_SEX_MODE_2', (ctx: GameContext) => selfMode(ctx) === 2)
  conditionEngine.registerPremise('EXHIBITIONISM_SEX_MODE_3', (ctx: GameContext) => selfMode(ctx) === 3)
  conditionEngine.registerPremise('EXHIBITIONISM_SEX_MODE_4', (ctx: GameContext) => selfMode(ctx) === 4)

  // 目标维度
  conditionEngine.registerPremise('TARGET_EXHIBITIONISM_SEX_MODE_GE_1', (ctx: GameContext) => targetMode(ctx) >= 1)
  conditionEngine.registerPremise('TARGET_EXHIBITIONISM_SEX_MODE_1', (ctx: GameContext) => targetMode(ctx) === 1)
  conditionEngine.registerPremise('TARGET_EXHIBITIONISM_SEX_MODE_2', (ctx: GameContext) => targetMode(ctx) === 2)
  conditionEngine.registerPremise('TARGET_EXHIBITIONISM_SEX_MODE_3', (ctx: GameContext) => targetMode(ctx) === 3)
  conditionEngine.registerPremise('TARGET_EXHIBITIONISM_SEX_MODE_4', (ctx: GameContext) => targetMode(ctx) === 4)
  conditionEngine.registerPremise('TARGET_NOT_IN_EXHIBITIONISM_SEX_MODE', (ctx: GameContext) => targetMode(ctx) === 0)

  // 玩家维度——固定查玩家实体（erArk PLAYER_ 前缀语义：不管触发者是谁，判玩家自己）。
  // ⚠️ 不用 selfId()：sourceId 可能是 NPC（NPC AI 上下文）——PLAYER_ 前提必须玩家视角
  conditionEngine.registerPremise('PLAYER_NOT_IN_EXHIBITIONISM_SEX_MODE', (ctx: GameContext) => {
    const id = ctx.player?.id
    if (!id) return false
    return getMode(id) === 0
  })
}
