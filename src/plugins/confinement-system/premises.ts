// 注释：监禁前提注册——覆盖各插件恒 false/恒 true 占位，注册真语义
// 条件引擎适配（grill Q4 定案）：
//   - handler 收 GameContext；sourceId = 触发者/被判定者（target），selectedCharacterId = UI 选中
//   - 后注册覆盖（condition-engine registerPremise 语义）——confinement onEnable 注册覆盖 sleep-system 占位
//   - 前提名大小写不敏感（引擎 lower 化）
//   - 权重场景（NPC AI/随机事件）：返回 number 即权重（本插件前提返回 boolean 即可，
//     消费方 weightAllToOne/premiseWeight 已做规范化）
//
// 注册清单（erArk handle_premise 对照）：
//   T_IMPRISONMENT_1/0     目标被监禁/未被监禁（erArk T_IMPRISONMENT）
//   IMPRISONMENT_1         自己（sourceId）被监禁（erArk IMPRISONMENT）
//   T_ESCAPING_1           目标逃跑中（erArk T_ESCAPING）
//   HAVE_BAG               玩家背包有携袋（tag=confinement_bag）
//   IN_PRISON              玩家所在地点是牢房（tag=prison）
//   PL_BAGGING_CHARA       玩家正在搬运该目标（bagging_chara_id == target）
//   T_BE_BAGGED_1          目标在袋中
//   PRISONER_IN_CUSTODY    有囚犯在押（阶段C）
//   HAVE_WARDEN            已有监狱长（阶段C）
//   T_NORMAL_2 覆盖        目标非监禁（sleep-system 恒 true 占位 → 真语义，erArk 位2）

import type { GameContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { gameContext } from '../../core/game-context'
import { modLoader } from '../../core/mod-loader'
import { getPrisoners, getWardenId, isImprisoned, getBaggingCharaId } from './state'
import { PRISON_TAG } from './prisoner'

// 注释：携袋物品 tag 约定（插件默认层 data/default/items.toml 提供，mod 可 override）
export const BAG_ITEM_TAG = 'confinement_bag'

function targetId(ctx: GameContext): string | null {
  return (ctx.selectedCharacterId as string) ?? null
}

function target(ctx: GameContext): any {
  const id = targetId(ctx)
  if (!id) return null
  return entitySystem.get('character', id) as any
}

// 注释：目标解析——AGENTS §8：handler 上下文 sourceId = 触发者/被判定者。
// 装袋/投牢/释放指令的"目标" = 选中角色（UI）或 sourceId（NPC 发起的判定）
function resolveTargetChar(ctx: GameContext): any {
  const sel = target(ctx)
  if (sel) return sel
  const sid = ctx.sourceId
  if (sid) return entitySystem.get('character', sid) as any
  return null
}

export function registerConfinementPremises(registry: any): void {
  const reg = (id: string, handler: (ctx: GameContext) => boolean | number) => {
    registry.registerPremise(id, handler)
  }

  // ── 监禁状态族 ──
  // T_IMPRISONMENT_1：目标被监禁（erArk T_IMPRISONMENT）
  reg('T_IMPRISONMENT_1', (ctx: GameContext) => {
    const c = resolveTargetChar(ctx)
    return c?.sp_flag?.imprisonment === true
  })
  // T_IMPRISONMENT_0：目标未被监禁（erArk T_IMPRISONMENT_0 反义）
  reg('T_IMPRISONMENT_0', (ctx: GameContext) => {
    const c = resolveTargetChar(ctx)
    return c?.sp_flag?.imprisonment !== true
  })
  // IMPRISONMENT_1：自己（sourceId）被监禁
  reg('IMPRISONMENT_1', (ctx: GameContext) => {
    if (!ctx.sourceId) return false
    return isImprisoned(ctx.sourceId)
  })
  // T_ESCAPING_1：目标逃跑中（erArk T_ESCAPING）
  reg('T_ESCAPING_1', (ctx: GameContext) => {
    const c = resolveTargetChar(ctx)
    return c?.sp_flag?.escaping === true
  })
  // T_BE_BAGGED_1：目标在袋中
  reg('T_BE_BAGGED_1', (ctx: GameContext) => {
    const c = resolveTargetChar(ctx)
    return c?.sp_flag?.be_bagged === true
  })

  // ── 装袋族 ──
  // HAVE_BAG：玩家背包有携袋道具（tag 约定，erArk HAVE_BAG :3998 查 item[151]）
  // 前提 handler 为同步契约（(ctx) => boolean|number），直接读实体 + mod 数据
  reg('HAVE_BAG', () => {
    const playerId = gameContext.getContext().player?.id
    if (!playerId) return false
    const char = entitySystem.get('character', playerId) as any
    const inv = char?.inventory
    if (!Array.isArray(inv)) return false
    const mod = modLoader.getMod()
    if (!mod) return false
    for (const entry of inv) {
      if (!entry?.itemId) continue
      const def = mod.items?.[entry.itemId] as any
      if (def?.tags?.includes(BAG_ITEM_TAG)) return true
    }
    return false
  })
  // IN_PRISON：玩家所在地点是牢房（erArk IN_PRISON，场景 tag 含 Prison）
  reg('IN_PRISON', () => {
    const loc = gameContext.getContext().location
    return loc?.tags?.includes(PRISON_TAG) === true
  })
  // PL_BAGGING_CHARA：玩家正在搬运该目标（erArk PL_BAGGING_CHARA）
  reg('PL_BAGGING_CHARA', (ctx: GameContext) => {
    const c = resolveTargetChar(ctx)
    if (!c?.id) return false
    return getBaggingCharaId() === c.id
  })
  // PL_NOT_BAGGING_CHARA：玩家未在搬运任何人（装袋前提——erArk 语义）
  // ⚠️ 2026-08-14 三轮审查修复：原实现 `目标≠搬运中对象` 允许在携带 A 时装袋 B →
  // bagging_chara_id 被覆盖、A 永久离线丢失（僵尸袋中人）。正确语义 = 搬运列表为空
  reg('PL_NOT_BAGGING_CHARA', () => {
    return !getBaggingCharaId()
  })
  // SCENE_ONLY_ONE：场景内只有玩家自己（erArk 投牢前提——牢房内无人）。
  // h-core 只有 SCENE_ONLY_TWO（含目标 ≤2），投牢需要"只有自己" → 本插件注册
  reg('SCENE_ONLY_ONE', () => {
    const loc = gameContext.getContext().location
    if (!loc) return false
    const playerId = gameContext.getContext().player?.id
    let others = 0
    for (const char of entitySystem.getAll('character')) {
      const c = char as any
      if (!c?.id || c.id === playerId) continue
      if (c.current_location === loc.id) others++
    }
    return others === 0
  })

  // TARGET_DEEP_UNCONSCIOUS：目标深度无意识（装袋前提——erArk T_UNNORMAL_6 位6 掩码 =
  // 完全意识不清醒：熟睡/时停/空气催眠）
  // ⚠️ 修复（2026-08-14 审查）：原装袋前提用 T_UNCONSCIOUS_FLAG_6（unconscious_h===6，
  // 不存在的等级）→ 装袋永远无法触发。深无意识 = unconscious_h ∈ {1,3,5}
  // （1=睡眠/睡奸，3=时停，5=空气催眠；4/6/7 是催眠体控非完全无意识）
  // ⚠️ 2026-08-14 五轮审查：删死代码——原读 c.sleep_level（不存在的字段，sleep-system
  // 熟睡等级是函数 getSleepLevel(char) 推导）；unconscious_h===1 是睡眠的权威标记
  // （sleep-system 维护 sleeping ⟺ unnormal bit5|6 不变量），已完整覆盖熟睡
  reg('TARGET_DEEP_UNCONSCIOUS', (ctx: GameContext) => {
    const c = resolveTargetChar(ctx)
    if (!c?.sp_flag) return false
    const uh = c.sp_flag.unconscious_h ?? 0
    return uh === 1 || uh === 3 || uh === 5
  })

  // ── 监狱长族（阶段C 用，提前注册——B/C 阶段指令数据直接可用）──
  // PRISONER_IN_CUSTODY：有囚犯在押（erArk handle_premise_work.py:809）
  reg('PRISONER_IN_CUSTODY', () => {
    return Object.keys(getPrisoners()).length > 0
  })
  // HAVE_WARDEN：已有监狱长（erArk HAVE_WARDEN）
  reg('HAVE_WARDEN', () => {
    return getWardenId() !== null
  })
  // T_HAVE_WARDEN：目标无监狱长相关（erArk 无——防御注册）
  reg('T_HAVE_WARDEN', () => {
    return getWardenId() !== null
  })

  // ── 覆盖 sleep-system 占位（T_NORMAL_2 恒 true → 真语义）──
  // T_NORMAL_2：目标非临盆/产后/监禁（erArk 位2 异常）——监禁落地后覆盖
  reg('T_NORMAL_2', (ctx: GameContext) => {
    const c = resolveTargetChar(ctx)
    if (!c) return false
    return c.sp_flag?.imprisonment !== true
  })
}
