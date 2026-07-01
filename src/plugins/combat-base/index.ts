// 注释：combat-base 插件——回合制战斗骨架
// 回合循环/CombatRuntime/钩子系统/队友接口/标准事件
// combat-wuxia extends 此插件，覆盖 damage_calc/hit_check 钩子

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import { bindingResolver } from '../../core/binding-resolver'
import type { CommandDef } from '../../core/command-registry'

// 注释：战斗运行时状态
interface CombatRuntime {
  participants: string[]
  enemies: string[]
  allies: string[]
  currentTurn: number
  currentActorIndex: number
  target: string | null
  turnOrder: string[]      // 按 speed 排序
}

let currentCombat: CombatRuntime | null = null

// 注释：钩子系统
// damage_calc/hit_check = 覆盖（子插件独占）
// turn_start/before_damage/after_damage/on_hit/turn_end = 链式（多个 handler 依次执行）
type HookHandler = (ctx: any) => any
const hooks = new Map<string, HookHandler[]>()
const overrideHooks = new Map<string, HookHandler>()

export function onLoad(_ctx: PluginContext): void {
  // 注释：start_combat effect type
  effectTypeRegistry.register('start_combat', async (params: any, execCtx: any) => {
    const sourceId = execCtx.sourceId ?? execCtx?._targetIds?.[0]
    await startCombat(params.enemies ?? [], params.allies ?? [sourceId], sourceId)
    return true
  })

  // 注释：damage effect type——基础伤害（子插件可覆盖 damage_calc 钩子）
  effectTypeRegistry.register('damage', async (params: any, execCtx: any) => {
    const targetIds = execCtx._targetIds as string[]
    for (const targetId of targetIds) {
      const damage = await calcDamage(execCtx.sourceId, targetId, params)
      applyDamage(targetId, damage)
    }
    return true
  })
}

export function onEnable(ctx: PluginContext): void {
  // 注释：注册 combat API
  ctx.api.register('combat', {
    // 注释：获取战斗上下文（供 effect-system target 解析）
    getCombatContext: (): any => {
      if (!currentCombat) return null
      return {
        enemies: currentCombat.enemies,
        allies: currentCombat.allies,
        target: currentCombat.target,
      }
    },
    // 注释：注册钩子
    registerHook: (hookName: string, handler: HookHandler): void => {
      // 注释：damage_calc/hit_check 是覆盖型，其他是链式
      if (hookName === 'damage_calc' || hookName === 'hit_check') {
        overrideHooks.set(hookName, handler)
      } else {
        const list = hooks.get(hookName) ?? []
        list.push(handler)
        hooks.set(hookName, list)
      }
    },
    // 注释：开始战斗
    start: async (enemies: string[], allies: string[]): Promise<void> => {
      await startCombat(enemies, allies, allies[0])
    },
    // 注释：执行回合行动（玩家/队友选了行动后调）
    executeAction: async (actorId: string, action: string, targetId: string): Promise<void> => {
      await executeAction(actorId, action, targetId)
    },
    // 注释：结束战斗
    end: async (winner: string, outcome: string): Promise<void> => {
      await endCombat(winner, outcome)
    },
  })

  // 注释：注册通用战斗指令（攻击/逃跑）
  const attackCmd: CommandDef = {
    id: 'combat_attack',
    label: '攻击',
    group: 'character_commands',
    modes: ['combat'],
    priority: 5,
    condition: 'combat.in_progress == true',
    source: 'plugin:combat-base',
    handler: async (execCtx: any) => {
      const actorId = execCtx?.gameStore?.player?.id
      const targetId = execCtx?.uiStore?.selectedCharacterId
      if (!actorId || !targetId || !currentCombat) return
      // 注释：校验目标在 enemies 列表中，不能攻击非参战者
      if (!currentCombat.enemies.includes(targetId)) {
        narrativeLog.write(`${getCharName(actorId)} 不能攻击 ${getCharName(targetId)}，不在战斗中`, 'combat', 'combat-base')
        return
      }
      await executeAction(actorId, 'attack', targetId)
    },
  }
  ctx.commands.register(attackCmd)

  const fleeCmd: CommandDef = {
    id: 'combat_flee',
    label: '逃跑',
    group: 'location_commands',
    modes: ['combat'],
    priority: 90,
    source: 'plugin:combat-base',
    handler: async () => {
      if (currentCombat) {
        await endCombat('', 'fled')
      }
    },
  }
  ctx.commands.register(fleeCmd)

  // 注释：监听 combat:request
  ctx.events.on('combat:request', async (payload: any) => {
    const player = gameContext.getContext().player
    if (!player) return
    await startCombat(payload?.enemies ?? [], [player.id], player.id)
  })
}

// 注释：开始战斗
async function startCombat(enemies: string[], allies: string[], _sourceId: string): Promise<void> {
  const participants = [...allies, ...enemies]
  const turnOrder = participants.slice().sort((a, b) => {
    const speedA = bindingResolver.get(a, 'speed') ?? 0
    const speedB = bindingResolver.get(b, 'speed') ?? 0
    return speedB - speedA
  })

  currentCombat = {
    participants, enemies, allies,
    currentTurn: 1, currentActorIndex: 0,
    target: enemies[0] ?? null, turnOrder,
  }

  // 注释：emit 参与者数据供 bridge 同步到 game-store
  eventBus.emit('combat:participants', { allies, enemies })

  await gameContext.enterMode('combat')
  await eventBus.emit('combat:start', { participants })
  narrativeLog.write('战斗开始！', 'combat', 'combat-base')

  await nextTurn()
}

// 注释：下一回合
async function nextTurn(): Promise<void> {
  if (!currentCombat) return

  // 注释：检查战斗是否结束
  if (await checkCombatEnd()) return

  const actorId = currentCombat.turnOrder[currentCombat.currentActorIndex]
  const isEnemy = currentCombat.enemies.includes(actorId)
  const isPlayer = gameContext.getContext().player?.id === actorId

  // 注释：turn_start 钩子（链式）
  await runChainHooks('turn_start', { actorId, combat: currentCombat })

  if (isPlayer || (!isEnemy && currentCombat.allies.includes(actorId))) {
    // 注释：玩家或队友——回 IDLE 等玩家选指令
    // TODO: 队友系统——队友行动时也回 IDLE 等玩家选
    narrativeLog.write(`轮到 ${getCharName(actorId)} 行动。`, 'combat', 'combat-base')
    // 注释：回 IDLE——command-executor 会自动处理
  } else {
    // 注释：NPC 自动行动——MVP 简单随机
    await npcAutoAction(actorId)
    // 注释：行动后进入下一个
    await advanceTurn()
  }
}

// 注释：NPC 自动行动——MVP 简单随机选一个存活的敌方目标
async function npcAutoAction(actorId: string): Promise<void> {
  if (!currentCombat) return
  // 注释：选一个存活的 allies
  const aliveAllies = currentCombat.allies.filter(id => (bindingResolver.get(id, 'hp') ?? 0) > 0)
  if (aliveAllies.length === 0) return
  const targetId = aliveAllies[Math.floor(Math.random() * aliveAllies.length)]
  narrativeLog.write(`${getCharName(actorId)} 攻击了 ${getCharName(targetId)}！`, 'combat', 'combat-base')
  const damage = await calcDamage(actorId, targetId, {})
  applyDamage(targetId, damage)
  await eventBus.emit('combat:turn', {
    actor: actorId,
    action: 'attack',
    target: targetId,
    result: { damage },
  })
}

// 注释：执行行动（玩家/队友选了行动后调）
async function executeAction(actorId: string, action: string, targetId: string): Promise<void> {
  if (!currentCombat) return
  currentCombat.target = targetId

  if (action === 'attack') {
    narrativeLog.write(`${getCharName(actorId)} 攻击了 ${getCharName(targetId)}！`, 'combat', 'combat-base')
    const damage = await calcDamage(actorId, targetId, {})
    applyDamage(targetId, damage)
    await eventBus.emit('combat:turn', {
      actor: actorId,
      action,
      target: targetId,
      result: { damage },
    })
  }

  await advanceTurn()
}

// 注释：推进回合——跳过已死亡的参战者
async function advanceTurn(): Promise<void> {
  if (!currentCombat) return
  // 注释：turn_end 钩子
  await runChainHooks('turn_end', { combat: currentCombat })

  // 注释：跳过已死亡的参战者
  let attempts = 0
  do {
    currentCombat.currentActorIndex++
    if (currentCombat.currentActorIndex >= currentCombat.turnOrder.length) {
      currentCombat.currentActorIndex = 0
      currentCombat.currentTurn++
    }
    attempts++
  } while (attempts < currentCombat.turnOrder.length * 2 &&
    (bindingResolver.get(currentCombat.turnOrder[currentCombat.currentActorIndex], 'hp') ?? 0) <= 0)

  await nextTurn()
}

// 注释：伤害计算——调 damage_calc 钩子（覆盖型，子插件独占）
async function calcDamage(sourceId: string, targetId: string, params: any): Promise<number> {
  const hook = overrideHooks.get('damage_calc')
  if (hook) {
    // 注释：子插件覆盖——调子插件的公式
    return await hook({ sourceId, targetId, params, combat: currentCombat }) ?? 0
  }
  // 注释：默认公式——damage = attack - defense（最小化）
  const attack = bindingResolver.get(sourceId, 'attack') ?? 10
  const defense = bindingResolver.get(targetId, 'defense') ?? 0
  return Math.max(1, attack - defense * 2)
}

// 注释：命中判定——调 hit_check 钩子（combat-wuxia 覆盖）
// async function checkHit(sourceId: string, targetId: string): Promise<boolean> {
//   const hook = overrideHooks.get('hit_check')
//   if (hook) {
//     return await hook({ sourceId, targetId, combat: currentCombat }) ?? true
//   }
//   return true
// }
// TODO: hit_check 在 combat-wuxia 中覆盖，combat-base 保留默认实现供其他战斗插件用

// 注释：应用伤害——emit combat:participants 刷新战斗 UI 的 HP 条
function applyDamage(targetId: string, damage: number): void {
  const current = bindingResolver.get(targetId, 'hp') ?? 0
  bindingResolver.set(targetId, 'hp', Math.max(0, current - damage))
  narrativeLog.write(`${getCharName(targetId)} 受到 ${damage} 点伤害（HP: ${current}→${Math.max(0, current - damage)}）`, 'combat', 'combat-base')
  eventBus.emit('character:changed', { id: targetId })
  // 注释：刷新战斗 UI 的 HP 条
  if (currentCombat) {
    eventBus.emit('combat:participants', { allies: currentCombat.allies, enemies: currentCombat.enemies })
  }
}

// 注释：检查战斗是否结束
async function checkCombatEnd(): Promise<boolean> {
  if (!currentCombat) return false
  // 注释：一方全倒
  const enemiesAlive = currentCombat.enemies.some(id => (bindingResolver.get(id, 'hp') ?? 0) > 0)
  const alliesAlive = currentCombat.allies.some(id => (bindingResolver.get(id, 'hp') ?? 0) > 0)

  if (!enemiesAlive) {
    await endCombat('allies', 'win')
    return true
  }
  if (!alliesAlive) {
    await endCombat('enemies', 'lose')
    return true
  }
  return false
}

// 注释：结束战斗
async function endCombat(winner: string, outcome: string): Promise<void> {
  if (!currentCombat) return
  const participants = currentCombat.participants
  currentCombat = null
  await gameContext.exitMode()
  await eventBus.emit('combat:end', { winner, outcome, participants })
  narrativeLog.write(`战斗结束（${outcome}）`, 'combat', 'combat-base')
}

// 注释：运行链式钩子
async function runChainHooks(hookName: string, ctx: any): Promise<void> {
  const list = hooks.get(hookName)
  if (!list) return
  for (const handler of list) {
    try {
      await handler(ctx)
    } catch (err) {
      // 注释：钩子错误隔离
      console.warn(`combat hook '${hookName}' error:`, err)
    }
  }
}

function getCharName(charId: string): string {
  const char = entitySystem.get('character', charId) as any
  return char?.name ?? charId
}
