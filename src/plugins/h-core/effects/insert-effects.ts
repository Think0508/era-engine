// 注释：h-core 插入/体位效果域（insert 批次基础设施，2026-08-26）
// 对照 erArk Behavior_Effect：
//   808/809/810 = PENIS_IN_T_VAGINA/WOMB/ANAL → sex_insert
//   851-862     = DR_POSITION_NORMAL…BACK_LIE → sex_position_set
//   867/868     = DR_POSITION_WOMB_INSERT / DR_POSITION_WOMB_SEX → sex_womb_mode_set
// 发射点：h:insert 只由 sex_insert 在“插入位发生迁移”时发出（counter-system male_stats.inserts 消费）。
// 门控：与 settle_* 一致——判定退缩（_judgeResult.retreated）时整链跳过，不插入、不计数。

import { effectTypeRegistry } from '../../../core/effect-type-registry'
import { entitySystem } from '../../../core/entity-system'
import { eventBus } from '../../../core/event-bus'
import { errorReporter } from '../../../core/error-reporter'
import { insertPositionToBodyCid } from '../settle/orgasm'
import { addEja, getEja } from '../settle/eja'

// 引擎插入码：0=V 1=A 2=U 3=W 4=M（h_state.insert_position）
const INSERT_POSITION_MAP: Record<string, number> = {
  vagina: 0,
  anal: 1,
  womb: 3,
  urethral: 2,
  mouth: 4,
  // wait_upon 侍奉位（erArk insert_position 0/1/2/3/4/5/10/11/15 → 引擎码 5-12）
  hair: 5,
  face: 6,
  breast: 7,
  axilla: 8,
  hand: 9,
  leg: 10,
  foot: 11,
  deep_throat: 12,
}

function canApply(ctx: any): boolean {
  return !ctx?._judgeResult?.retreated
}

function getSelf(ctx: any): any | null {
  const id = ctx?.sourceId
  if (!id) return null
  return entitySystem.get('character', id) as any ?? null
}

export function registerInsertEffects(): void {
  // 808/809/810 PENIS_IN_T_*：写入目标 insert_position，并（可选）同步写入玩家体位/子宫位。
  // 仅在 insert_position 实际迁移时 emit h:insert（每次“进入动作”计 1，含射精重置后重插；
  // 换体位/连续抽插不在此效果重复计数）。
  effectTypeRegistry.register('sex_insert', async (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    const targetIds = execCtx._targetIds as string[]
    if (!targetIds || targetIds.length === 0) return true
    const receiverId = targetIds[0]
    const inserterId = execCtx.sourceId
    const receiver = entitySystem.get('character', receiverId) as any
    const inserter = inserterId ? entitySystem.get('character', inserterId) as any : null
    if (!receiver?.h_state || !inserter?.h_state) {
      errorReporter.report({
        source: 'h-core',
        severity: 'warning',
        message: `sex_insert：缺少 H 状态（receiver=${receiverId}, inserter=${inserterId ?? '?'}），效果跳过`,
        suggestion: 'sex_insert 只在 H 场景内使用，执行前双方 h_state 应已由 startHScene 创建',
      })
      return true
    }
    const partCode = INSERT_POSITION_MAP[_p.part as string]
    if (partCode === undefined) {
      errorReporter.report({
        source: 'h-core',
        severity: 'warning',
        message: `sex_insert：未知部位 '${_p.part}'，效果跳过`,
        suggestion: '支持 vagina / anal / womb / urethral / mouth',
      })
      return true
    }
    const prev = receiver.h_state.insert_position
    const changed = prev !== partCode

    if (typeof _p.position === 'number' && _p.position >= 1 && _p.position <= 12) {
      inserter.h_state.current_sex_position = _p.position
    }
    if (typeof _p.wombMode === 'number') {
      inserter.h_state.current_womb_sex_position = _p.wombMode
    }
    receiver.h_state.insert_position = partCode

    if (changed && _p.countable !== false) {
      const partCid = insertPositionToBodyCid(partCode)
      await eventBus.emit('h:insert', {
        character: inserterId,
        target: receiverId,
        // 注释：male_stats 的 dims.part 读 payload.position（与 h:shoot 同约定 = body part cid 6/8/7）；
        // part 字段同时提供可读别名；sex_position 保留体位维度（后续 position_stats 扩展用）
        part: partCid,
        position: partCid,
        sex_position: inserter.h_state.current_sex_position ?? -1,
        kind: 'penis',
      })
    }
    return true
  })

  // 851-862 DR_POSITION_*：写入玩家 current_sex_position（optionally 记录 pre_sex_position）。
  // 换体位本身不发 h:insert（体位使用由 handleExecutionEnd 的 h:position_use 记）。
  effectTypeRegistry.register('sex_position_set', (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    const self = getSelf(execCtx)
    if (!self?.h_state) return true
    const pos = Number(_p.position)
    if (!Number.isInteger(pos) || pos < 1 || pos > 12) {
      errorReporter.report({
        source: 'h-core',
        severity: 'warning',
        message: `sex_position_set：无效体位 '${_p.position}'，效果跳过`,
        suggestion: '1-12 对应 Sex_Position.csv（1=正常位 … 12=背面卧位）',
      })
      return true
    }
    if (_p.record_pre !== false) {
      const old = self.h_state.current_sex_position ?? -1
      if (old !== pos) {
        self.h_state.pre_sex_position = old
      }
    }
    self.h_state.current_sex_position = pos
    return true
  })

  // 70 ADD_SMALL_P_FEEL（自身少量 P 快/射精欲）——erArk default.py:3698-3723：
  // eja_point += int(add_time + 10 + 当前 eja_point × 0.4)
  effectTypeRegistry.register('eja_add', async (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    const id = execCtx.sourceId
    if (!id) return true
    const cur = await getEja(id)
    const delta = Math.floor((execCtx._timeCost ?? 10) + 10 + cur * 0.4)
    await addEja(id, delta)
    return true
  })

  // 1406 PL_JUST_SHOOT_OFF：清洁口交后清掉“刚射精”标记（h_state.just_shoot = 0）
  effectTypeRegistry.register('just_shoot_off', (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    const self = getSelf(execCtx)
    if (self?.h_state) self.h_state.just_shoot = 0
    return true
  })

  // 867/868 DR_POSITION_WOMB_INSERT / DR_POSITION_WOMB_SEX：写玩家 current_womb_sex_position。
  // 不写 insert_position、不发 h:insert（进入子宫的插入由同链 sex_insert(part='womb') 负责）。
  effectTypeRegistry.register('sex_womb_mode_set', (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    const self = getSelf(execCtx)
    if (!self?.h_state) return true
    const mode = Number(_p.mode)
    if (mode !== 1 && mode !== 2) {
      errorReporter.report({
        source: 'h-core',
        severity: 'warning',
        message: `sex_womb_mode_set：无效 mode '${_p.mode}'，效果跳过`,
        suggestion: '1=子宫口插入（DR_POSITION_WOMB_INSERT），2=子宫姦（DR_POSITION_WOMB_SEX）',
      })
      return true
    }
    self.h_state.current_womb_sex_position = mode
    return true
  })

  // 6301/6345（入口）与 6302/6318/6332/6346（换体位）的效果：打开性交体位面板。
  // 核心不直接碰 Pinia——发事件给 engine-ui-bridge，由它写 uiStore.activePanel/sexPositionPanel。
  effectTypeRegistry.register('open_sex_position_panel', async (_p: any, _execCtx: any) => {
    await eventBus.emit('ui:open_sex_position_panel', {
      sexType: Number(_p.sexType ?? 1),
      change: _p.change === true,
    })
    return true
  })
}