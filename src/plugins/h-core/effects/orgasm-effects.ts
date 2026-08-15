// 注释：h-core 效果域模块——H 场景生命周期与绝顶结算类效果（E2 拆分，2026-08-15）
// 自 index.ts 原样迁出：h_start_h / h_end_h / h_orgasm_check / release_time_stop_orgasm /
// orgasm_edge_on / orgasm_edge_off + 私有 helper（setOrgasmEdge / autoClothOff）。
// 依赖共享 helper：startHScene / endHScene / handleOrgasmResults 仍留在 index.ts
// （handleExecutionEnd / onEnable 指令 handler 共用），经 '../index' 导入（跨文件同一插件内部，
// 非跨插件 import——注册调用发生在 onLoad 运行时，循环引用安全）。
// 纯重构：handler 逻辑零改动，仅注册位置迁移（onLoad 中 registerOrgasmEffects() 调用点
// 位于原 h_start_h 首次注册处，保持注册顺序不变）。

import { effectTypeRegistry } from '../../../core/effect-type-registry'
import { entitySystem } from '../../../core/entity-system'
import { modLoader } from '../../../core/mod-loader'
import { apiSystem } from '../../../core/api'
import { getContinuousAdjust } from '../../../core/command-executor'
import { orgasmJudge, insertPositionToBodyCid, releaseTimeStopOrgasm, type OrgasmSettleOptions } from '../settle/orgasm'
import { startHScene, endHScene, handleOrgasmResults } from '../index'

export function registerOrgasmEffects(): void {
  effectTypeRegistry.register('h_start_h', async (_p: any, execCtx: any) => {
    const allyId = execCtx.sourceId
    // 注释：G1-I-2——params 可省略（{ type = "h_start_h", target = "selected" }
    // 是对话选项的常见写法，effect-system 不再全局兜底 params）——handler 自防御
    const targetId = _p?.targetId ?? execCtx._targetIds?.[0]
    if (!allyId || !targetId) return
    // 注释：H 开始时自动脱 auto_off 槽位（胸罩/内裤等）
    autoClothOff(allyId)
    autoClothOff(targetId)
    await startHScene(allyId, targetId)
    return true
  })

  effectTypeRegistry.register('h_end_h', async (_p: any, execCtx: any) => {
    const allyId = execCtx.sourceId
    if (allyId) await endHScene(allyId)
    return true
  })

  // 注释：h_orgasm_check——手动触发二段高潮结算（兼容旧指令；自动结算走 game:execution_end）
  effectTypeRegistry.register('h_orgasm_check', async (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    // 注释：二段结算上下文（连续减值/群交/结算记录——绝顶附加状态用）
    let isGroupSex = false
    try {
      isGroupSex = await apiSystem.call('h-group-sex', 'isActive')
    } catch { /* 群交插件未注册 */ }
    const opts: OrgasmSettleOptions = { continuous: getContinuousAdjust(), isGroupSex, settlement: execCtx.settlement }
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.h_state) continue
      // 注释：extra 累积走 pending_orgasm_feel（settle_state/tech_adjust 已写入）；statusDelta 兼容参数已弃用
      const result = await orgasmJudge(id, undefined, opts)
      await handleOrgasmResults(id, ch, result)
      // 注释：玩家射精触发（与 execution_end 一致）
      if (result.shouldEjaculate && (id === '0' || id === 'player')) {
        if (effectTypeRegistry.has('eja_climax')) {
          void apiSystem.call('effect-system', 'execute', [
            { type: 'eja_climax', params: { positionId: insertPositionToBodyCid(ch.h_state?.insert_position ?? -1) }, target: 'self' },
          ], { sourceId: id, _targetIds: [id] })
        }
      }
    }
    return true
  })

  // 注释：release_time_stop_orgasm——时停绝顶解放（对齐 erArk TIME_STOP_ORGASM_RELEASE，
  // default.py:6764-6800）。由 h-time-stop 在时停解除时经 effect 通道调用（跨插件禁直接 import），
  // 把时停中累计的绝顶转成真实高潮结算
  effectTypeRegistry.register('release_time_stop_orgasm', async (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.h_state) continue
      const result = releaseTimeStopOrgasm(id, { continuous: getContinuousAdjust(), settlement: execCtx.settlement })
      if (result.orgasms.length > 0) await handleOrgasmResults(id, ch, result)
    }
    return true
  })

  // 注释：绝顶寸止开关（对齐 erArk default.py:2255-2297）
  // orgasm_edge_on：置 orgasm_edge=1，清空寸止计数
  // orgasm_edge_off：置 orgasm_edge=0
  function setOrgasmEdge(ids: string[], edge: number, resetCount: boolean): void {
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.h_state) continue
      ch.h_state.orgasm_edge = edge
      if (resetCount) ch.h_state.orgasm_edge_count = {}
    }
  }

  effectTypeRegistry.register('orgasm_edge_on', (_p: any, execCtx: any) => {
    setOrgasmEdge(execCtx._targetIds as string[], 1, true)
    return true
  })
  effectTypeRegistry.register('orgasm_edge_off', (_p: any, execCtx: any) => {
    setOrgasmEdge(execCtx._targetIds as string[], 0, false)
    return true
  })
}

// 注释：H 开始时自动脱 auto_off 槽位（胸罩/内裤），但跳过饰品 (cloth_tag=6)
function autoClothOff(charId: string): void {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return
  const mod = modLoader.getMod()
  const autoSlots = mod?.equipmentSlots?.filter(s => (s as any).auto_off).map(s => s.id) ?? []
  for (const slot of autoSlots) {
    if (ch.equipment?.[slot]) {
      const itemId = ch.equipment[slot]
      const itemDef = mod?.items[itemId] as any
      // 注释：饰品（cloth_tag=6）不自动脱
      if (itemDef?.cloth_tag === 6) continue
      if (!ch.equipment_off) ch.equipment_off = {}
      ch.equipment_off[slot] = ch.equipment[slot]
      delete ch.equipment[slot]
    }
  }
}
