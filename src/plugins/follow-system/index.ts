// 注释：follow-system 插件——同行/跟随系统
// 复刻 erArk is_follow 语义（game_type.py:768）：
//   0 不跟随 / 1 智能跟随 / 2 强制跟随 / 3 前往博士办公室（方舟专属，已移除）/
//   4 前往博士当前位置（召唤，AI 未实现 TODO）
// 核心行为（handle_npc_ai.py 逐条对齐）：
//   - 智能跟随（1）：玩家移动时，同位置跟随者瞬移同步（judge_same_position_npc_follow）；
//     普通 AI 不接管（character-system 通过 isControlled 跳过，等价 erArk 取消工作/娱乐）
//   - 强制跟随（2）：每游戏小时强制移动到玩家位置（judge_character_follow ==2）
//   - 疲劳自动解除（judge_character_tired_sleep）：可选绑定 hp ≤1 → 解除 + follow_tired 口上
//   - 离线归零：角色离线（character:offline）→ 解除（reason=offline）
//   - 口上抑制：跟随者到达不打招呼（dialogue registerSceneCharFilter('greet')，talk.py:56）

import { conditionEngine } from '../../core/condition-engine'
import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import { bindingResolver } from '../../core/binding-resolver'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { errorReporter } from '../../core/error-reporter'
import { apiSystem } from '../../core/api'
import { registerFollowPremises } from './premise/follow'

export type FollowEndReason = 'instruction' | 'fatigue' | 'offline'

// 注释：跟随模式合法区间（3 已移除，仅 0-2/4 可用）
const VALID_MODES = new Set([0, 1, 2, 4])

// 注释：greet 过滤器只注册一次（onEnable 重复执行/HMR 不重复注册）
let greetFilterRegistered = false

// 注释：读角色跟随模式
function getFollowModeById(charId: string): number {
  const char = entitySystem.get('character', charId) as any
  if (!char?.sp_flag) return 0
  return (char.sp_flag.is_follow ?? 0) as number
}

// 注释：写角色跟随模式——唯一写入点（指令效果/hidden 直写除外，见 TODO）
// 事件规则：0→非0 发 follow:started {character, mode}；非0→0 发 follow:ended {character, reason}；
// 1↔2↔4 之间切换只发 character:changed（不重复 started）
function setFollowMode(charId: string, mode: number, reason: FollowEndReason): boolean {
  if (mode === 3) {
    errorReporter.report({
      source: 'follow-system',
      severity: 'error',
      message: `跟随模式 3（前往博士办公室）已移除——方舟世界观专属，不使用`,
      suggestion: '合法模式：0/1/2/4',
    })
    return false
  }
  if (!Number.isInteger(mode) || !VALID_MODES.has(mode)) {
    errorReporter.report({
      source: 'follow-system',
      severity: 'error',
      message: `跟随模式 ${mode} 非法（合法：0/1/2/4）`,
    })
    return false
  }
  const char = entitySystem.get('character', charId) as any
  if (!char) {
    errorReporter.report({
      source: 'follow-system',
      severity: 'warning',
      message: `setFollowMode 角色 '${charId}' 不存在，跳过`,
      suggestion: '检查角色 ID 是否正确',
    })
    return false
  }
  if (!char.sp_flag) char.sp_flag = {}
  const prev = char.sp_flag.is_follow ?? 0
  if (prev === mode) return true

  if (mode === 4) {
    // 注释：模式4 = 召唤（角色前往主角当前位置）——AI 未实现，先存储 + 提醒
    errorReporter.report({
      source: 'follow-system',
      severity: 'warning',
      message: `跟随模式 4（召唤）已存储但 AI 未实现`,
      suggestion: 'TODO(follow-system)：实现召唤逻辑（角色移动至玩家当前位置）',
    })
  }
  char.sp_flag.is_follow = mode
  // 注释：条件镜像字段（condition_fields 消费）——与 sp_flag.is_follow 单点同步
  // 原因：条件路径 resolution 只走实体直接键（如 current_location 先例），走不到 sp_flag 嵌套
  char.following = mode !== 0
  char.follow_mode = mode
  if (mode === 0) {
    eventBus.emit('follow:ended', { character: charId, reason: reason ?? 'instruction' })
  } else if (prev === 0) {
    eventBus.emit('follow:started', { character: charId, mode })
  }
  eventBus.emit('character:changed', { id: charId })
  return true
}

// 注释：解除跟随（供疲劳/离线/指令共用）
function endFollow(charId: string, reason: FollowEndReason): void {
  setFollowMode(charId, 0, reason)
}

// 注释：同位置跟随者瞬移同步（erArk judge_same_position_npc_follow）
// 玩家移动时，玩家原地点（from）中 is_follow∈{1,2} 的角色瞬移到新地点（零耗时，同时到达）
// 冻结角色（时停 unconscious_h）/死亡角色不跟随；离线角色 current_location=null 天然跳过；玩家自身防御性跳过
function teleportFollowers(from: string, to: string): void {
  if (!from || !to) return
  const playerId = gameContext.getContext().player?.id
  for (const char of entitySystem.getAll('character')) {
    const c = char as any
    if (c.id === playerId) continue
    if (c.dead) continue
    const mode = c.sp_flag?.is_follow ?? 0
    if (mode !== 1 && mode !== 2) continue
    if (c.current_location !== from) continue
    if ((c.sp_flag?.unconscious_h ?? 0) >= 1) continue
    c.current_location = to
    eventBus.emit('character:changed', { id: c.id })
  }
}

// 注释：跟随 AI 轮询（game:hour_changed）——erArk judge_character_follow + judge_character_tired_sleep
async function runFollowAi(): Promise<void> {
  const playerId = gameContext.getContext().player?.id
  const playerLocation = gameContext.getContext().location?.id ?? null
  for (const char of entitySystem.getAll('character')) {
    const c = char as any
    const mode = c.sp_flag?.is_follow ?? 0
    if (mode === 0) continue
    // 注释：冻结（时停）/死亡/离线角色跳过
    if ((c.sp_flag?.unconscious_h ?? 0) >= 1) continue
    if (c.dead) continue
    if (c.sp_flag?.offline) continue
    if (c.id === playerId) continue

    // 注释：疲劳自动解除（可选绑定 hp；未绑定 → 跳过）
    // erArk judge_character_tired_sleep：HP≤1 或困倦≥2 → 解除+提示；困倦度依赖睡眠系统（TODO）
    // getForPlugin：只读 follow-system 自己的绑定——get() 会撞到其他插件同名键
    // （combat-base 也绑 hp，首个映射胜出会读到错误属性，静默）
    const hp = bindingResolver.getForPlugin('follow-system', c.id, 'hp')
    if (hp !== null && hp !== undefined && Number(hp) <= 1) {
      narrativeLog.write(`${c.name ?? c.id} 太累了，无法继续跟随`, 'system', 'follow-system')
      endFollow(c.id, 'fatigue')
      // 注释：口上场景 follow_tired——mod 可写反应式口上（无则静默）
      try {
        await apiSystem.call('dialogue', 'triggerScene', 'follow_tired', c.id)
      } catch { /* dialogue 未就绪，跳过 */ }
      continue
    }

    // 注释：强制跟随（mode 2）——每游戏小时移动到玩家位置（erArk judge_character_follow ==2）
    if (mode === 2 && playerLocation && c.current_location !== playerLocation) {
      c.current_location = playerLocation
      eventBus.emit('character:changed', { id: c.id })
    }
    // 注释：mode 4（召唤）AI 未实现——TODO(follow-system)
  }
}

// 注释：onLoad——注册效果类型 + 前提
export function onLoad(_ctx: PluginContext): void {
  // 注释：set_follow——设置跟随模式（指令效果链用；等价 erArk 效果 363/365）
  effectTypeRegistry.register('set_follow', async (params: any, execCtx: any) => {
    // 注释：mode 必填——缺省默认 0 会把"邀请同行"静默变成"结束同行"（复刻批次漏写参数的陷阱）
    const rawMode = params?.mode
    if (rawMode === undefined || rawMode === null) {
      errorReporter.report({
        source: 'follow-system',
        severity: 'warning',
        message: `set_follow 缺少 mode 参数，跳过`,
        suggestion: '指令效果需写 mode（0/1/2/4）',
      })
      return false
    }
    const mode = Number(rawMode)
    if (!Number.isInteger(mode) || !VALID_MODES.has(mode)) {
      errorReporter.report({
        source: 'follow-system',
        severity: 'warning',
        message: `set_follow 收到非法模式 ${mode}（合法：0/1/2/4）`,
        suggestion: '检查指令效果参数',
      })
      return false
    }
    const targetIds = (execCtx?._targetIds as string[]) ?? []
    if (targetIds.length === 0) {
      errorReporter.report({
        source: 'follow-system',
        severity: 'warning',
        message: `set_follow 无目标角色，跳过`,
        suggestion: '效果 target 应解析到选中角色（selected）',
      })
      return false
    }
    for (const id of targetIds) {
      setFollowMode(id, mode, 'instruction')
    }
    return true
  })

  // 注释：前提注册（TARGET_IS_FOLLOW / TARGET_NOT_FOLLOW / IS_FOLLOW / NOT_FOLLOW /
  // IS_FOLLOW_4 / NO_TARGET_OR_TARGET_CAN_COOPERATE）
  registerFollowPremises(conditionEngine)
}

// 注释：onEnable——注册 follow API + 事件监听 + greet 过滤器
// async：greet 过滤器注册需 await（plugin-manager 会 await onEnable）
export async function onEnable(ctx: PluginContext): Promise<void> {
  // 注释：注册 follow API
  ctx.api.register('follow', {
    // 注释：是否正在跟随（is_follow ≠ 0）
    isFollowing: (charId: string): boolean => getFollowModeById(charId) !== 0,
    // 注释：当前跟随模式 0-4
    getMode: (charId: string): number => getFollowModeById(charId),
    // 注释：设置跟随模式（0/1/2/4；3 已移除会报错）
    setMode: (charId: string, mode: number): boolean => setFollowMode(charId, mode, 'instruction'),
    // 注释：邀请同行（智能跟随）
    invite: (charId: string): boolean => setFollowMode(charId, 1, 'instruction'),
    // 注释：结束同行（reason 可选：instruction/fatigue/offline）
    end: (charId: string, reason?: string): boolean => setFollowMode(charId, 0, (reason as FollowEndReason) ?? 'instruction'),
    // 注释：所有正在跟随的角色 ID 列表
    getFollowers: (): string[] => {
      const result: string[] = []
      for (const char of entitySystem.getAll('character')) {
        const c = char as any
        if ((c.sp_flag?.is_follow ?? 0) !== 0) result.push(c.id)
      }
      return result
    },
    // 注释：是否被跟随系统接管（character-system 的普通 AI 移动跳过查询）
    // 仅模式 1/2（有实际 AI 控制）——mode 4（召唤 TODO）不冻结 NPC，普通 AI 照常
    isControlled: (charId: string): boolean => {
      const mode = getFollowModeById(charId)
      return mode === 1 || mode === 2
    },
  })

  // 注释：监听玩家移动 → 同位置跟随者瞬移同步
  // priority -100：先于 dialogue-system 的 location:enter（默认 0）——跟随者先就位
  ctx.events.on('location:enter', (payload: any) => {
    teleportFollowers(payload?.from, payload?.to)
  }, -100)

  // 注释：监听游戏小时 → 跟随 AI 轮询
  ctx.events.on('game:hour_changed', async () => {
    await runFollowAi()
  })

  // 注释：监听角色离线 → 解除跟随（reason=offline）
  ctx.events.on('character:offline', (payload: any) => {
    const charId = payload?.id
    if (!charId) return
    if (getFollowModeById(charId) !== 0) {
      endFollow(charId, 'offline')
    }
  })

  // 注释：注册 greet 过滤器——跟随者到达不打招呼（erArk talk.py:56 NOT_FOLLOW）
  // 必须 await：apiSystem.call 返回 Promise，同步 try/catch 捕不到拒绝（unhandled rejection）
  // 失败不置位 flag——HMR/重载后可重试
  if (!greetFilterRegistered) {
    try {
      await ctx.api.call('dialogue', 'registerSceneCharFilter', 'greet', (charId: string) => {
        return getFollowModeById(charId) !== 0
      })
      greetFilterRegistered = true
    } catch {
      errorReporter.report({
        source: 'follow-system',
        severity: 'warning',
        message: `注册 greet 过滤器失败（dialogue-system 未就绪）`,
        suggestion: '跟随者到达时仍会打招呼（口上抑制未生效）',
      })
    }
  }
}
