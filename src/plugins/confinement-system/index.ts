// 注释：confinement-system 插件主入口
// 复刻 erArk 监禁系统（confinement_and_training.py / default.py 装袋投牢释放结算）
// 阶段划分（grill Q1 定案）：
//   A 核心闭环：装袋/投牢/释放/放出 4 指令 + 囚犯状态 + 逃脱结算
//   B 逃跑闭环：追捕委托（quest startDynamicScene + 藏匿点）
//   C 监狱长+调教：任命/训练/准备/助手
//
// 依赖（API/事件，禁直接 import）：h-core（H/实行判定）、h-mark（刻印）、h-npc-ai（H内AI）、
//   npc-ai-system（跳过集/pre-check）、character-system（离线/在线）、map-system（tag）、
//   inventory-system（背包）、quest-system（B）、sleep-system（前提覆盖）、effect-system

import type { PluginContext } from '../../core/types'
import { conditionEngine } from '../../core/condition-engine'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { apiSystem } from '../../core/api'
import { modLoader } from '../../core/mod-loader'
import { gameContext } from '../../core/game-context'
import { registerConfinementPremises } from './premises'
import { registerConfinementSaveProvider, getPrisoners, getSettings, getWardenId } from './state'
import { charaBecomePrisoner, charaRelease, getUnusedPrisonCell } from './prisoner'
import { settlePrisoners, debugPrisoners, recaptureFugitive, checkFugitiveDeadline, getFugitives } from './escape'
import { designateWarden, removeWarden, settleTraining, setTrainingModes, type TrainingModeDef } from './warden'
import { onHStart, onHEnd, registerAssistant } from './assistant'

// 注释：训练模式数据（插件默认层 + mod 覆盖——talk-common 同款 glob 模式）
const trainingDefaultModules = import.meta.glob<string>(
  '/src/plugins/confinement-system/data/default/training.toml',
  { import: 'default', eager: false },
)
const trainingModModules = import.meta.glob<string>(
  '/mods/*/definitions/training.toml',
  { import: 'default', eager: false },
)

async function loadTrainingModes(): Promise<void> {
  const modes: TrainingModeDef[] = []
  for (const loader of Object.values(trainingDefaultModules)) {
    try {
      const raw = await loader()
      const parsed = (await import('@iarna/toml')).parse(raw) as { modes?: TrainingModeDef[] }
      if (Array.isArray(parsed.modes)) modes.push(...parsed.modes)
    } catch (err) {
      errorReporter.report({
        source: 'confinement-system',
        severity: 'warning',
        message: `默认训练模式解析失败：${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }
  // mod 覆盖（同 id 胜出）
  const activeModId = modLoader.getMod()?.id
  if (activeModId) {
    const prefix = `/mods/${activeModId}/definitions/training.toml`
    for (const [path, loader] of Object.entries(trainingModModules)) {
      if (path !== prefix) continue
      try {
        const raw = await loader()
        const parsed = (await import('@iarna/toml')).parse(raw) as { modes?: TrainingModeDef[] }
        if (Array.isArray(parsed.modes)) {
          for (const m of parsed.modes) {
            const idx = modes.findIndex(x => x.id === m.id)
            if (idx >= 0) modes[idx] = m
            else modes.push(m)
          }
        }
      } catch (err) {
        errorReporter.report({
          source: 'confinement-system',
          severity: 'warning',
          message: `mod 训练模式解析失败：${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }
  }
  setTrainingModes(modes)
}

export function onLoad(_ctx: PluginContext): void {
  // 注释：玩家 id 统一走 core gameContext（2026-08-14 审查：原读 execCtx.gameStore，
  // NPC 发起/测试直调时缺失会静默 return true；gameContext 是引擎权威玩家源）
  const getPlayerId = (): string | null => gameContext.getContext().player?.id ?? null

  // 注释：装袋搬走（erArk 5036 BAGGING_AND_MOVING）——目标离线进袋
  // 前提由指令 TOML 声明（premises），效果链集中在这里
  effectTypeRegistry.register('confinement_bagging', async (_p: any, execCtx: any) => {
    const targetIds = (execCtx?._targetIds as string[]) ?? []
    if (targetIds.length === 0) return true
    const targetId = targetIds[0]
    const target = entitySystem.get('character', targetId) as any
    if (!target) return true
    if (!target.sp_flag) target.sp_flag = {}
    // 玩家记录搬运目标（bagging_chara_id）——玩家实体
    const playerId = getPlayerId()
    if (!playerId) return true
    const player = entitySystem.get('character', playerId) as any
    if (!player?.sp_flag) player.sp_flag = {}
    // ⚠️ 2026-08-14 三轮审查：防御——已在搬运他人时拒绝（前提 PL_NOT_BAGGING_CHARA
    // 已拦，此处兜底防"装袋 B 覆盖 A → A 永久离线丢失"）
    if (player.sp_flag.bagging_chara_id && player.sp_flag.bagging_chara_id !== targetId) {
      errorReporter.report({
        source: 'confinement-system',
        severity: 'warning',
        message: `装袋失败：正在搬运 ${player.sp_flag.bagging_chara_id}（先投牢或放出）`,
        suggestion: '先在牢房投牢或从袋中放出当前搬运目标',
      })
      return true
    }
    player.sp_flag.bagging_chara_id = targetId
    // 目标进袋 + 离线
    target.sp_flag.be_bagged = true
    try {
      await apiSystem.call('character', 'setOffline', targetId, 'bagged')
    } catch (err) {
      // ⚠️ 2026-08-14 四轮审查：setOffline 失败 = 角色仍在场景但 be_bagged=true（静默不一致，
      // 且玩家 bagging_chara_id 已设 → 后续投牢对"在线目标"操作）——回滚装袋状态
      player.sp_flag.bagging_chara_id = ''
      target.sp_flag.be_bagged = false
      errorReporter.report({
        source: 'confinement-system',
        severity: 'warning',
        message: `装袋失败（离线失败，已回滚）：${err instanceof Error ? err.message : String(err)}`,
        suggestion: '检查 character-system 是否已加载（setOffline API）',
      })
      return true
    }
    eventBus.emit('confinement:bagged', { character: targetId })
    eventBus.emit('character:changed', { id: targetId })
    narrativeLog.write(`${target.name ?? targetId} 被装进袋子里了。`, 'system', 'confinement-system')
    return true
  })

  // 注释：投入监牢（erArk 5038 PUT_INTO_PRISON）——袋中人上线成为囚犯
  effectTypeRegistry.register('confinement_put_into_prison', async (_p: any, _execCtx: any) => {
    const playerId = getPlayerId()
    if (!playerId) return true
    const player = entitySystem.get('character', playerId) as any
    const baggedId = player?.sp_flag?.bagging_chara_id
    if (!baggedId) return true
    // 注释：牢房位置——core gameContext 权威（UI store location 可能未同步；2026-08-14 审查修复）
    const loc = gameContext.getContext().location?.id ?? null
    if (!loc) {
      errorReporter.report({
        source: 'confinement-system',
        severity: 'warning',
        message: `投入监牢失败：当前地点未知（投牢需在牢房内）`,
        suggestion: '检查当前地点是否已设置（gameContext.location）',
      })
      return true
    }
    // 上线到当前地点（牢房）——setOnline 幂等（offline 才生效）
    try {
      await apiSystem.call('character', 'setOnline', baggedId, loc)
    } catch (err) {
      // ⚠️ 2026-08-14 四轮审查：上线失败 = 袋中人仍离线，若清 bagging_chara_id 会变成
      // 僵尸袋中人（无搬运记录、离线、be_bagged=true，释放/投牢都找不到）——保留搬运
      // 记录 + 上报，玩家可重试或放出
      errorReporter.report({
        source: 'confinement-system',
        severity: 'warning',
        message: `投牢上线失败：${err instanceof Error ? err.message : String(err)}（搬运状态保留，可重试）`,
        suggestion: '检查 character-system 是否已加载（setOnline API）',
      })
      return true
    }
    // 玩家失去搬运目标
    player.sp_flag.bagging_chara_id = ''
    // 成为囚犯
    await charaBecomePrisoner(baggedId)
    return true
  })

  // 注释：解除囚禁（erArk 5039 SET_FREE）
  effectTypeRegistry.register('confinement_set_free', async (_p: any, execCtx: any) => {
    const targetIds = (execCtx?._targetIds as string[]) ?? []
    if (targetIds.length === 0) return true
    await charaRelease(targetIds[0])
    return true
  })

  // 注释：从袋中放出（erArk RELEASE_FROM_BAG）——目标上线回原处，不成为囚犯
  effectTypeRegistry.register('confinement_release_from_bag', async (_p: any, _execCtx: any) => {
    const playerId = getPlayerId()
    if (!playerId) return true
    const player = entitySystem.get('character', playerId) as any
    const baggedId = player?.sp_flag?.bagging_chara_id
    if (!baggedId) return true
    const target = entitySystem.get('character', baggedId) as any
    // ⚠️ 2026-08-14 四轮审查：先上线成功再清标记（原顺序——setOnline 失败时角色 offline +
    // be_bagged=false + 无搬运记录 = 僵尸袋中人，无法再操作）。setOnline 缺省位置回 home
    try {
      await apiSystem.call('character', 'setOnline', baggedId, undefined)
    } catch (err) {
      errorReporter.report({
        source: 'confinement-system',
        severity: 'warning',
        message: `放出袋中人失败：${err instanceof Error ? err.message : String(err)}（搬运状态保留，可重试）`,
        suggestion: '检查 character-system 是否已加载（setOnline API）',
      })
      return true
    }
    if (target?.sp_flag) target.sp_flag.be_bagged = false
    player.sp_flag.bagging_chara_id = ''
    eventBus.emit('confinement:released_from_bag', { character: baggedId })
    narrativeLog.write(`${target?.name ?? baggedId} 从袋子里被放了出来。`, 'system', 'confinement-system')
    return true
  })

  // 注释：抓回逃犯（追捕委托 reward step 效果——erArk 委托完成送回重囚）
  effectTypeRegistry.register('confinement_recapture', async (params: any, _execCtx: any) => {
    const fugitiveId = params?.fugitive as string | undefined
    if (!fugitiveId) {
      errorReporter.report({
        source: 'confinement-system',
        severity: 'warning',
        message: `confinement_recapture 缺少 fugitive 参数`,
        suggestion: '追捕委托 reward step 需写 params = { fugitive = 逃犯ID }',
      })
      return false
    }
    await recaptureFugitive(fugitiveId)
    return true
  })

  // 注释：任命监狱长（erArk 监狱长工作任命——指令 effect）
  effectTypeRegistry.register('confinement_designate_warden', async (params: any, execCtx: any) => {
    const targetIds = (execCtx?._targetIds as string[]) ?? []
    const charId = params?.character as string | undefined ?? targetIds[0]
    if (!charId) {
      errorReporter.report({
        source: 'confinement-system',
        severity: 'warning',
        message: `confinement_designate_warden 无目标角色`,
        suggestion: '指令 target 应解析到选中角色（selected），或 params.character 直传角色 id',
      })
      return false
    }
    return await designateWarden(charId)
  })

  // 注释：解除监狱长（指令 effect）
  effectTypeRegistry.register('confinement_remove_warden', async (_p: any, _execCtx: any) => {
    await removeWarden()
    return true
  })

  // 注释：日常训练（阶段C——每日结算触发；半成品标记：每日一次为简化，
  // 通用工作系统落地后改为工作行为链触发——docs/master-todo.md）
  effectTypeRegistry.register('confinement_train_prisoners', async (_p: any, _execCtx: any) => {
    await settleTraining()
    return true
  })

  // 注释：调教前准备（erArk 5043 prepare_training + confinement_and_training.prepare_training :254）
  // 流程：三方（玩家/目标/监狱长）移动到调教室 → 等待 → 清洗（清 dirty）→ 润滑（apply_lubricant）
  // → 道具（body_item_equip；消耗类由监狱长服用——erArk 特殊点）。简化（grill Q8 定案）：
  // 复用现有 effect 链（body_item/lubricant/dirty 已有），无新引擎机制
  effectTypeRegistry.register('confinement_prepare_training', async (_p: any, execCtx: any) => {
    const targetIds = (execCtx?._targetIds as string[]) ?? []
    const playerId = getPlayerId()
    if (targetIds.length === 0 || !playerId) return true
    const targetId = targetIds[0]
    const wardenId = getWardenId()

    // 找调教室（tag=humiliation_room）
    let trainingRoom = ''
    const mod = modLoader.getMod()
    if (mod) {
      for (const [locId, loc] of mod.locations) {
        if (loc.tags?.includes('humiliation_room')) { trainingRoom = locId; break }
      }
    }
    if (!trainingRoom) {
      errorReporter.report({
        source: 'confinement-system',
        severity: 'warning',
        message: `调教前准备失败：mod 无调教室（tag=humiliation_room）`,
        suggestion: '在 mod 地图中定义带 humiliation_room tag 的地点',
      })
      return false
    }

    // 三方移动（erArk :259——全员原地等待 5 分钟；本引擎直接移动）
    const s = getSettings()
    for (const charId of [playerId, targetId, ...(wardenId ? [wardenId] : [])]) {
      try {
        await apiSystem.call('character', 'moveTo', charId, trainingRoom)
      } catch (err) {
        // 注释：moveTo 失败（可达性/角色不存在）→ 直接写位置兜底 + 上报（防静默：
        // 囚犯没到调教室但流程照走 = 叙事错位）
        const c = entitySystem.get('character', charId) as any
        if (c) c.current_location = trainingRoom
        errorReporter.report({
          source: 'confinement-system',
          severity: 'warning',
          message: `调教前准备移动 '${charId}' 到调教室失败：${err instanceof Error ? err.message : String(err)}（已强制传送）`,
          suggestion: '检查调教室地点的可达性（maps/graph 边）',
        })
      }
    }
    const target = entitySystem.get('character', targetId) as any
    // 清洗（erArk pre_training_cleaning——目标污浊重置）
    if (s.prep_clean && target?.dirty) {
      target.dirty = {}
    }
    // 润滑（erArk 玩家使用身体润滑，监狱长获得大量润滑——简化：apply_lubricant 效果）
    const prepEffects: any[] = []
    if (s.prep_lube) {
      prepEffects.push({ type: 'apply_lubricant', params: {} })
    }
    if (prepEffects.length > 0) {
      try {
        await apiSystem.call('effect-system', 'execute', prepEffects, {
          sourceId: playerId,
          _targetIds: [targetId],
          _timeCost: 10,
        })
      } catch (err) {
        errorReporter.report({
          source: 'confinement-system',
          severity: 'warning',
          message: `调教前准备效果执行失败：${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }
    // 道具（erArk pre_training_tool_dict——持续性道具装到目标 body_item）
    // body_item_equip 读 execCtx._itemId + params.slot → 每道具单独 execute
    for (const [itemId, on] of Object.entries(s.prep_tools)) {
      if (!on) continue
      const itemDef = (modLoader.getMod()?.items as any)?.[itemId] as any
      if (!itemDef || itemDef.body_slot === undefined || itemDef.body_slot < 0) continue
      try {
        await apiSystem.call('effect-system', 'execute', [
          { type: 'body_item_equip', params: { slot: itemDef.body_slot } },
        ], {
          sourceId: playerId,
          _targetIds: [targetId],
          _itemId: itemId,
          _timeCost: 10,
        })
      } catch (err) {
        errorReporter.report({
          source: 'confinement-system',
          severity: 'warning',
          message: `调教道具 '${itemId}' 装备失败：${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }
    narrativeLog.write(`调教前的准备工作完成了。`, 'system', 'confinement-system')
    return true
  })
}

// 注释：onEnable——前提注册 + save provider + API + 事件监听
export async function onEnable(ctx: PluginContext): Promise<void> {
  // 注释：前提注册必须在 onEnable（不在 onLoad）——后注册覆盖语义：
  //   T_NORMAL_2 由 sleep-system 在 onLoad 注册恒 true，若 confinement 也在 onLoad 注册，
  //   加载顺序靠后的插件会覆盖真语义（plugin-manager 按 data_dependencies topo-sort，
  //   顺序不可控）→ 在 onEnable 注册保证晚于所有 onLoad（T_IMPRISONMENT_1 同理，
  //   已从 h-core pendingFalse 移除，见 premise-instruct.ts ★1 修复）
  registerConfinementPremises(conditionEngine)

  registerConfinementSaveProvider()

  // 注释：训练模式数据加载（默认层 + mod 覆盖）
  await loadTrainingModes()

  // 注释：逃跑中角色跳过 AI 结算（escaping = 位7 离线语义——藏匿点上线但 AI 不决策）
  // npc-ai skip-registry 通用机制（core 中介，不直接 import）
  try {
    const { registerSkipRule } = await import('../../core/skip-registry')
    registerSkipRule('escaping', (_entityId: string, entity: any) => {
      return entity?.sp_flag?.escaping === true
    })
  } catch (err) {
    errorReporter.report({
      source: 'confinement-system',
      severity: 'warning',
      message: `注册逃跑跳过规则失败：${err instanceof Error ? err.message : String(err)}`,
    })
  }

  // 注释：调教助手（阶段C）——注册行为源（幂等）
  await registerAssistant()

  // 注释：公共 API（其他插件/GM 指令调用）
  ctx.api.register('confinement', {
    // 注释：成为囚犯（供追捕归还等调用）
    becomePrisoner: async (charId: string): Promise<void> => {
      await charaBecomePrisoner(charId)
    },
    // 注释：释放囚犯
    release: async (charId: string): Promise<void> => {
      await charaRelease(charId)
    },
    // 注释：查询是否被监禁（其他系统用——口上/战斗前提等）
    isImprisoned: (charId: string): boolean => {
      const c = entitySystem.get('character', charId) as any
      return c?.sp_flag?.imprisonment === true
    },
    isEscaping: (charId: string): boolean => {
      const c = entitySystem.get('character', charId) as any
      return c?.sp_flag?.escaping === true
    },
    // 注释：囚犯列表（id 数组 + 记录）
    getPrisoners: (): Record<string, { imprisonedAt: unknown; escapeProbability: number }> => {
      return { ...getPrisoners() }
    },
    // 注释：设置读取/写入（管理面板用）——读取返回深拷贝（prep_tools/assistant_list/
    // assistant_ban 均拷贝，防外部改数组污染内部状态）
    getSettings: () => ({
      ...getSettings(),
      prep_tools: { ...getSettings().prep_tools },
      assistant_list: [...getSettings().assistant_list],
      assistant_ban: [...getSettings().assistant_ban],
    }),
    setSettings: (patch: Partial<Record<string, unknown>>): void => {
      const s = getSettings()
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'prep_tools' && typeof v === 'object' && v) {
          s.prep_tools = { ...s.prep_tools, ...(v as Record<string, boolean>) }
          continue
        }
        if (k === 'assistant_list' && Array.isArray(v)) {
          s.assistant_list = [...(v as string[])]
          continue
        }
        if (k === 'assistant_ban' && Array.isArray(v)) {
          s.assistant_ban = [...(v as string[])]
          continue
        }
        // ⚠️ 2026-08-14 五轮审查：数值枚举设置校验（防静默非法值——
        // training=99 → 训练找不到模式；living_condition="高" → 逃脱公式 NaN）
        const numericKeys: Record<string, { min: number; max: number }> = {
          training: { min: 0, max: 6 },
          clothing: { min: 0, max: 2 },
          underwear: { min: 0, max: 2 },
          living_condition: { min: 0, max: 2 },
          assistant: { min: 0, max: 3 },
          target: { min: 0, max: 1 },
        }
        const range = numericKeys[k]
        if (range) {
          const num = Number(v)
          if (!Number.isFinite(num) || num < range.min || num > range.max || !Number.isInteger(num)) {
            errorReporter.report({
              source: 'confinement-system',
              severity: 'warning',
              message: `设置 '${k}' 值 ${JSON.stringify(v)} 非法（合法 ${range.min}-${range.max} 整数），已忽略`,
            })
            continue
          }
          ;(s as unknown as Record<string, unknown>)[k] = num
          continue
        }
        if (k === 'prep_clean' || k === 'prep_lube') {
          ;(s as unknown as Record<string, unknown>)[k] = v === true
          continue
        }
        errorReporter.report({
          source: 'confinement-system',
          severity: 'warning',
          message: `设置 '${k}' 不是已知设置键，已忽略`,
        })
      }
      eventBus.emit('confinement:settings_changed', {})
    },
    // 注释：空牢房分配（追捕归还用）
    getUnusedPrisonCell: (): string => getUnusedPrisonCell(),
    // 注释：监狱长查询/任命/解除（阶段C）
    getWardenId: (): string | null => getWardenId(),
    designateWarden: async (charId: string): Promise<boolean> => designateWarden(charId),
    removeWarden: async (): Promise<void> => { await removeWarden() },
    // 注释：逃犯列表（追捕委托状态查询）
    getFugitives: () => ({ ...getFugitives() }),
    // 注释：debug 辅助
    debugPrisoners: (): string[] => debugPrisoners(),
  })

  // 注释：每日结算——逃犯超时 + 逃脱（erArk basement.update_base_resouce_newday 末尾
  // settle_prisoners）+ 监狱长训练（阶段C，半成品：每日一次）
  // ⚠️ 2026-08-14 六轮审查：事件监听幂等守卫——onEnable 二次调用（HMR/同进程重载）
  // 会重复注册监听 → game:new_day 双倍结算（逃脱/训练执行两次）；event-bus 无同 handler
  // 去重，需模块级守卫（follow-system greetFilterRegistered 同款模式）
  if (!newDayListenerRegistered) {
    newDayListenerRegistered = true
    ctx.events.on('game:new_day', async () => {
      // 2026-08-15 复查轮 3 M-1：时停守卫——时停中跨午夜（回拨在 execution_end）不结算
      let tsActive = false
      try { tsActive = !!apiSystem.callSync('h-time-stop', 'isActive') } catch { /* 插件缺失 */ }
      if (tsActive) return
      await checkFugitiveDeadline()
      await settlePrisoners()
      await settleTraining()
    })
  }

  // 注释：调教助手（阶段C）——H 开始拉监狱长入 H / H 结束清理（erArk settle_behavior 触发）
  if (!hStartListenerRegistered) {
    hStartListenerRegistered = true
    ctx.events.on('h:start', async (payload: any) => {
      await onHStart(payload)
    })
    ctx.events.on('h:end', async () => {
      onHEnd()
    })
  }
}

// 注释：事件监听注册守卫（模块级——onEnable 幂等）
let newDayListenerRegistered = false
let hStartListenerRegistered = false

// 注释：导出（测试用）
export { getFugitives }
