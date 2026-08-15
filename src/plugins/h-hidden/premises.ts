// 注释：h-hidden 前提注册模块（index.ts 拆分）
// 职责：隐奸相关前提注册（HIDDEN_SEX_MODE_* / TARGET_* / T_* / PLAYER_* / 复合前提 / UI 场所前提），
// 即原 onEnable 中前提注册段落的全部内容。

import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { gameContext, isPlayerChar } from '../../core/game-context'
import { errorReporter } from '../../core/error-reporter'
import { getMode } from './scene'

function getSelfId(ctx: any): string | null {
  return ctx.gameStore?.player?.id ?? ctx.sourceId ?? null
}

function getTargetId(ctx: any): string | null {
  return ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId ?? null
}

// 注释：注册隐奸前提（onEnable 原位内容，注册顺序与原实现一致）
export function registerHiddenSexPremises(ctx: PluginContext): void {
  // Find 4 修复（第五轮）：空 catch 静默吞掉注册失败——h-core 未就绪时 25+ 前提全部
  // 静默消失；上报一次（去重）不阻断
  let premiseRegWarned = false
  const reg = async (id: string, fn: (c: any) => boolean) => {
    try { await ctx.api.call('engine', 'premises.register', id, fn) } catch (err) {
      if (!premiseRegWarned) {
        premiseRegWarned = true
        errorReporter.report({
          source: 'h-hidden',
          severity: 'warning',
          message: `隐奸前提注册失败（h-core 未就绪？）：${err instanceof Error ? err.message : String(err)}`,
          suggestion: '检查 h-core 插件是否已加载（registerPremise API）——隐奸前提将全部不可用',
        })
      }
    }
  }

  function getTargetMode(ctx2: any): number {
    const id = getTargetId(ctx2)
    if (!id) return 0
    return getMode(id)
  }

  function getSelfMode(ctx2: any): number {
    const id = getSelfId(ctx2)
    if (!id) return 0
    return getMode(id)
  }

  // 注释：HIDDEN_SEX_MODE_0 — 不在隐奸中
  reg('HIDDEN_SEX_MODE_0', (ctx2: any) => getSelfMode(ctx2) === 0)
  reg('HIDDEN_SEX_MODE_GE_1', (ctx2: any) => getSelfMode(ctx2) >= 1)
  reg('HIDDEN_SEX_MODE_1', (ctx2: any) => getSelfMode(ctx2) === 1)
  reg('HIDDEN_SEX_MODE_2', (ctx2: any) => getSelfMode(ctx2) === 2)
  reg('HIDDEN_SEX_MODE_3', (ctx2: any) => getSelfMode(ctx2) === 3)
  reg('HIDDEN_SEX_MODE_4', (ctx2: any) => getSelfMode(ctx2) === 4)
  reg('HIDDEN_SEX_MODE_1_OR_2', (ctx2: any) => { const m = getSelfMode(ctx2); return m === 1 || m === 2 })
  reg('HIDDEN_SEX_MODE_3_OR_4', (ctx2: any) => { const m = getSelfMode(ctx2); return m === 3 || m === 4 })
  reg('HIDDEN_SEX_MODE_1_OR_3', (ctx2: any) => { const m = getSelfMode(ctx2); return m === 1 || m === 3 })
  reg('HIDDEN_SEX_MODE_2_OR_4', (ctx2: any) => { const m = getSelfMode(ctx2); return m === 2 || m === 4 })

  // 注释：目标的对应前提
  reg('TARGET_HIDDEN_SEX_MODE_GE_1', (ctx2: any) => getTargetMode(ctx2) >= 1)
  reg('TARGET_HIDDEN_SEX_MODE_1', (ctx2: any) => getTargetMode(ctx2) === 1)
  reg('TARGET_HIDDEN_SEX_MODE_2', (ctx2: any) => getTargetMode(ctx2) === 2)
  reg('TARGET_HIDDEN_SEX_MODE_3', (ctx2: any) => getTargetMode(ctx2) === 3)
  reg('TARGET_HIDDEN_SEX_MODE_4', (ctx2: any) => getTargetMode(ctx2) === 4)
  reg('TARGET_HIDDEN_SEX_MODE_1_OR_2', (ctx2: any) => { const m = getTargetMode(ctx2); return m === 1 || m === 2 })
  reg('TARGET_HIDDEN_SEX_MODE_3_OR_4', (ctx2: any) => { const m = getTargetMode(ctx2); return m === 3 || m === 4 })
  // ★ 修复（第八轮）：数据引用 T_ 前缀版（t_hidden_sex_mode_1_or_3 等，58+46 行）——
  // 原只注册了 self 版与 TARGET_ 版，T_ 版挂在 h-core pendingFalse 恒 false 占位上静默死亡。
  // T_ 前缀语义 = 查目标（replicating skill 规则），与 TARGET_ 版同 handler
  reg('T_HIDDEN_SEX_MODE_1_OR_3', (ctx2: any) => { const m = getTargetMode(ctx2); return m === 1 || m === 3 })
  reg('T_HIDDEN_SEX_MODE_2_OR_4', (ctx2: any) => { const m = getTargetMode(ctx2); return m === 2 || m === 4 })
  // ★ 修复（第九轮）：TARGET_ 版 1_OR_3/2_OR_4——h-config talk.situations 权重条目
  // （target_hidden_sex_mode_1_or_3 等）引用此名，原缺失 → getWeight 非严格静默跳过 → 权重永不生效
  reg('TARGET_HIDDEN_SEX_MODE_1_OR_3', (ctx2: any) => { const m = getTargetMode(ctx2); return m === 1 || m === 3 })
  reg('TARGET_HIDDEN_SEX_MODE_2_OR_4', (ctx2: any) => { const m = getTargetMode(ctx2); return m === 2 || m === 4 })

  // 注释：TARGET_NOT_IN_HIDDEN_SEX_MODE — 目标不在隐奸中
  reg('TARGET_NOT_IN_HIDDEN_SEX_MODE', (ctx2: any) => getTargetMode(ctx2) === 0)

  // 注释：玩家相关前提
  reg('PLAYER_IN_HIDDEN_SEX_MODE', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    return getMode(id) >= 1
  })
  reg('PLAYER_NOT_IN_HIDDEN_SEX_MODE', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    return getMode(id) === 0
  })
  reg('PL_NOT_HIDDEN_SEX_MODE_3_OR_4', (_ctx2: any) => {
    const playerId = entitySystem.getAll('character').find((c: any) => isPlayerChar(c.id))?.id
    if (!playerId) return true
    const m = getMode(playerId); return !(m === 3 || m === 4)
  })

  // 注释：复合前提
  // ★ 修复（第七轮）：SLEEP_H_OR_HIDDEN_SEX 的"睡眠 H"判定原用 unconscious_h===3（时停）——
  // erArk 语义是 unconscious_flag==1（睡奸=1，handle_premise_sp_flag.py:2387）；3 是时停，
  // 会导致时停中误触发睡奸口上、睡奸中不触发（潜伏静默错误，睡眠系统落地后暴露）
  reg('SLEEP_H_OR_HIDDEN_SEX', (ctx2: any) => {
    const id = getSelfId(ctx2); if (!id) return false
    const ch = entitySystem.get('character', id) as any
    // 注释：睡眠 H（unconscious_h=1 睡奸）或 hidden_sex_mode >= 1
    return (ch?.sp_flag?.unconscious_h === 1) || (getMode(id) >= 1)
  })
  reg('TARGET_SLEEP_H_OR_HIDDEN_SEX', (ctx2: any) => {
    const id = getTargetId(ctx2); if (!id) return false
    const ch = entitySystem.get('character', id) as any
    return (ch?.sp_flag?.unconscious_h === 1) || (getMode(id) >= 1)
  })

  reg('PLAYER_NOT_H_OR_HIDDEN_SEX_MODE', (_ctx2: any) => {
    const playerId = entitySystem.getAll('character').find((c: any) => isPlayerChar(c.id))?.id
    if (!playerId) return true
    const ch = entitySystem.get('character', playerId) as any
    // 注释：不在 H 中 或者在隐奸中
    return !ch?.h_state?.is_h || getMode(playerId) >= 1
  })

  // 注释：UI/场所相关前提
  reg('SHOW_NON_H_IN_HIDDEN_SEX', (_ctx2: any) => {
    // 注释：cache 级标志，存于 game context
    return (gameContext.getContext() as any)?.show_non_h_in_hidden_sex === true
  })
  reg('NOT_SHOW_NON_H_IN_HIDDEN_SEX', (_ctx2: any) => {
    return (gameContext.getContext() as any)?.show_non_h_in_hidden_sex !== true
  })

  reg('PLACE_SOMEONE_H_BUT_NOT_HIDDEN_SEX', (_ctx2: any) => {
    // 注释：场景中有他人处于非隐奸 H 模式（Find 2 修复（第五轮）：同地点——全图扫描在
    // 500 NPC mod 下恒真，前提失去场景语义）
    const locId = gameContext.getContext().location?.id
    if (!locId) return false
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (c.current_location !== locId) continue
      if (c?.h_state?.is_h && (getMode(c.id) === 0)) return true
    }
    return false
  })

  reg('PLACE_SOMEONE_NOT_IN_HIDDEN_AND_CONSCIOUS', (_ctx2: any) => {
    // 注释：场景中有他人不在隐奸中且有意识（A2 修复：睡眠者不算有意识；
    // Find 2 修复（第五轮）：同地点）
    const locId = gameContext.getContext().location?.id
    if (!locId) return false
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (c.current_location !== locId) continue
      if (isPlayerChar(c.id)) continue
      if (getMode(c.id) === 0 && !c?.sp_flag?.unconscious_h && !c?.sp_flag?.sleeping) return true
    }
    return false
  })
}
