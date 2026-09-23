// 注释：manual-system 插件入口（2026-09-23 秘籍-技能系统）
//
// 系统一句话：**秘籍（知识）** 由 **卷册（物品）** 解锁修炼，修炼烧「经验」升层；
// 每层发永久成长与层奖励（技能/天赋）；主动技能靠"用"涨经验，上限由秘籍进度钳制；
// 可装配的被动能力（内功）在装配期间提供声明式属性修正。
//
// 模块划分（同目录）：
//   context.ts  定义桶读取 + 能力↔秘籍反向索引（单一真相：秘籍层表）
//   manual.ts   进度 / 上限 / 修炼 / 发放 / 授予 / 分层技能同步
//   internal.ts 内功装配（槽位 = 属性有效值；-1 = 无限）
//   economy.ts  击败经验 + 首杀账本
//   skills.ts   技能经验闸门 / 经验曲线与层数上限提供者 / 补升
//
// 对外：effect 七种 + API 两个 namespace（manual / internal）。见 docs/manual-system.md。

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { eventBus } from '../../core/event-bus'
import { gameContext } from '../../core/game-context'
import { apiSystem } from '../../core/api'
import { entitySystem } from '../../core/entity-system'
import { applyAttrDelta } from '../../core/entity-utils'
import { errorReporter } from '../../core/error-reporter'
import { config } from './context'
import { grantLayers, listManuals, manualState, practice, unlockCap } from './manual'
import { equip, listEquipped, slots, unequip } from './internal'
import { settleKillExp } from './economy'
import { levelCapProvider, onSkillUsed, skillCostProvider, xpCurveProvider } from './skills'

// 注释：onLoad——注册 effect 类型（不依赖任何其他插件）
export function onLoad(_ctx: PluginContext): void {
  const cfg = () => config()

  // 修炼（唯一"花经验买层"的正规入口）：params.layers 缺省 1；0 = 连修到不能修
  effectTypeRegistry.register('practice_manual', async (params: any, ctx: any) => {
    const ids = (ctx?._targetIds ?? []) as string[]
    const manual = params?.manual
    if (typeof manual !== 'string' || !manual) return false
    const layers = typeof params?.layers === 'number' ? params.layers : 1
    let ok = false
    for (const id of ids) {
      const r = practice(id, manual, layers)
      ok = ok || r.ok
      // 剧情/脚本调用失败要看得见原因（UI 面板走 API 自己取 reasons[]）
      if (!r.ok && r.reasons.length > 0 && params?.report_failure === true) {
        errorReporter.reportDedup(`manual-practice:${manual}`, {
          source: 'manual-system', severity: 'warning',
          message: `修炼 '${manual}' 未成功：${r.reasons.join('；')}`,
        })
      }
    }
    return ok
  })

  // 任务/剧情直给层数（不走经验与门槛，走同一发放管线）
  effectTypeRegistry.register('learn_manual_layer', async (params: any, ctx: any) => {
    const ids = (ctx?._targetIds ?? []) as string[]
    const manual = params?.manual
    const layer = params?.layer
    if (typeof manual !== 'string' || typeof layer !== 'number') return false
    let ok = false
    for (const id of ids) {
      const r = grantLayers(id, manual, layer)
      ok = ok || r.ok
    }
    return ok
  })

  // 永久提升层数上限（残本合成/总纲类特例）
  effectTypeRegistry.register('unlock_manual_cap', async (params: any, ctx: any) => {
    const ids = (ctx?._targetIds ?? []) as string[]
    const manual = params?.manual
    const cap = params?.cap
    if (typeof manual !== 'string' || typeof cap !== 'number') return false
    let ok = false
    for (const id of ids) ok = unlockCap(id, manual, cap) || ok
    return ok
  })

  // 内功装配 / 卸下
  effectTypeRegistry.register('equip_internal', async (params: any, ctx: any) => {
    const ids = (ctx?._targetIds ?? []) as string[]
    const ability = params?.ability
    if (typeof ability !== 'string' || !ability) return false
    let ok = false
    for (const id of ids) {
      const r = equip(id, ability)
      if (!r.ok && r.reason) {
        errorReporter.reportDedup(`manual-equip:${ability}:${r.reason}`, {
          source: 'manual-system', severity: 'warning',
          message: `装配 '${ability}' 失败：${r.reason}`,
        })
      }
      ok = r.ok || ok
    }
    return ok
  })
  effectTypeRegistry.register('unequip_internal', async (params: any, ctx: any) => {
    const ids = (ctx?._targetIds ?? []) as string[]
    const ability = params?.ability
    if (typeof ability !== 'string' || !ability) return false
    let ok = false
    for (const id of ids) ok = unequip(id, ability).ok || ok
    return ok
  })

  // 任务/GM 给经验（击败结算是自动路径；这里给剧情路径）
  effectTypeRegistry.register('grant_exp', async (params: any, ctx: any) => {
    const ids = (ctx?._targetIds ?? []) as string[]
    const amount = params?.amount
    if (typeof amount !== 'number' || !Number.isFinite(amount)) return false
    let ok = false
    for (const id of ids) {
      const char = entitySystem.get('character', id)
      if (!char) continue
      ok = !!applyAttrDelta(char as any, cfg().exp_attr, amount) || ok
    }
    return ok
  })

  // 打开修炼面板（UI 由 engine-ui-bridge 消费 `ui:open_manual_panel`）
  effectTypeRegistry.register('open_manual_panel', async (params: any, _ctx: any) => {
    await eventBus.emit('ui:open_manual_panel', { manual: params?.manual ?? null })
    return true
  })
}

// 注释：onEnable——注册 API / 条件路径别名 / 外部提供者 / 事件监听
export function onEnable(ctx: PluginContext): void {
  // 条件路径别名：character.{id}.equipped.{能力ID} → 角色字段 equipped_abilities（数组包含语义）
  gameContext.setFieldAliases({ equipped: 'equipped_abilities' })

  ctx.api.register('manual', {
    getState: (charId: string, manualId: string) => manualState(charId, manualId),
    listManuals: (charId: string) => listManuals(charId),
    practice: (charId: string, manualId: string, layers = 1) => practice(charId, manualId, layers),
    grantLayer: (charId: string, manualId: string, toLayer: number) => grantLayers(charId, manualId, toLayer),
    unlockCap: (charId: string, manualId: string, cap: number) => unlockCap(charId, manualId, cap),
    getConfig: () => config(),
  })

  ctx.api.register('internal', {
    equip: (charId: string, abilityId: string) => equip(charId, abilityId),
    unequip: (charId: string, abilityId: string) => unequip(charId, abilityId),
    list: (charId: string) => listEquipped(charId),
    slots: (charId: string) => slots(charId),
  })

  // 外部提供者：层数上限（秘籍钳制）、技能经验曲线（品级表）、技能蓝耗（品级表 cost）
  // ——前两个注册给 ability-progression，第三个注册给 combat-base（战斗是唯一消费 cost 的地方）
  try {
    apiSystem.callSync('abilities', 'registerLevelCapProvider', levelCapProvider)
    apiSystem.callSync('abilities', 'registerXpCurveProvider', xpCurveProvider)
  } catch (err) {
    errorReporter.report({
      source: 'manual-system', severity: 'warning',
      message: `注册成长提供者失败（ability-progression 未就绪？）：${err instanceof Error ? err.message : String(err)}`,
      suggestion: '插件依赖声明里已含 abilities:ready——若在单插件测试中直调 onEnable，请先 onEnable ability-progression',
    })
  }
  // 技能蓝耗提供者：技能没写 cost 时按秘籍品级表给（未启用战斗插件 → 跳过，不影响其他功能）
  try {
    apiSystem.callSync('combat', 'registerSkillCostProvider', skillCostProvider)
  } catch {
    // 该 mod 没有战斗插件：蓝耗规则无从生效（不报警，因为这不是配置错误）
  }

  // 战斗事件：用技能涨经验 / 击败得经验
  ctx.events.on('combat:skill_used', (p: any) => { void onSkillUsed(p) })
  ctx.events.on('combat:end', (p: any) => { settleKillExp(p) })
}

// 注释：测试用——清反向索引缓存（mod 对象变更会自动失效，这里给测试确定性入口）
export { __resetManualContext } from './context'
