// 注释：dialogue-system 插件——口上演出管线 + 交互式对话树
// 口上 = 演出——几乎所有指令执行后触发对应口上
// 三层口上：场景通用（scene-dialogue.toml）+ 角色通用（character-dialogue.toml，fallback）+ 角色专属（characters/dialogue/{charId}/dialogue.toml）
// 优先级：角色专属 > 角色通用，场景通用独立输出

import type { PluginContext } from '../../core/types'
import type { ReactiveLine, Conversation, ConversationNode } from '../../core/mod-loader'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import { modLoader } from '../../core/mod-loader'
import { commandRegistry } from '../../core/command-registry'
import type { CommandDef } from '../../core/command-registry'
import { conditionEngine } from '../../core/condition-engine'
import { premiseRegistry } from '../../core/premise-registry'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { weightedRandom } from '../../utils/weighted-random'
import { apiSystem } from '../../core/api'
import type { ConversationRef } from '../../core/mod-loader'
import { parseConversationRef, resolveConversation } from '../../core/mod-loader'

// 注释：对话运行时状态——当前在哪个 node
interface ConversationRuntime {
  ref: ConversationRef     // 引用方式
  convId: string
  nodeId: string
  nodes: Map<string, ConversationNode>
}

// 注释：场景角色过滤器（2026-08-10）——按 scene 分组注册，触发某场景的某角色时
// 任一过滤器返回 true 即跳过整段输出（口上 + talk-common 兜底）。
// follow-system 用它实现"跟随者到达不打招呼"（erArk talk.py:56 NOT_FOLLOW 过滤）。
// 通用机制：未来送别/移动场景、其他插件（隐奸隐藏等）均可注册。
const sceneCharFilters = new Map<string, Array<(charId: string) => boolean>>()

let currentConversation: ConversationRuntime | null = null

// 注释：onLoad——注册 effect types
export function onLoad(_ctx: PluginContext): void {
  // 注释：trigger_dialogue——指令执行后触发对口上
  effectTypeRegistry.register('trigger_dialogue', async (params: any, execCtx: any) => {
    const scene = (params.scene as string) ?? execCtx._commandId
    if (!scene) return true
    const targetIds = execCtx._targetIds as string[]
    const charId = targetIds.length > 0 ? targetIds[0] : undefined
    await triggerSceneInternal(scene, charId)
    return true
  })
}

// 注释：onEnable——注册 dialogue API + talk 指令 + 监听 location:enter
export function onEnable(ctx: PluginContext): void {
  // 注释：注册 dialogue API
  ctx.api.register('dialogue', {
    // 注释：触发反应式口上（演出管线）——其他系统调此方法
    // scene: 场景名（如 greet/hurt/rest/move/enter）
    // charId: 可选角色ID——有则查角色专属>通用，无则只查场景通用
    triggerScene: async (scene: string, charId?: string): Promise<void> => {
      await triggerSceneInternal(scene, charId)
    },
    // 注释：开始交互式对话——接受 ConversationRef 或字符串简写
    // ref: "character:令狐冲/teach_sword" 或 { type, ... } 对象
    // speaker: 可选默认说话者
    startConversation: async (ref: ConversationRef | string, speaker?: string | null): Promise<void> => {
      const parsed = typeof ref === 'string' ? parseConversationRef(ref) : ref
      await startConversationInternal(parsed, speaker ?? undefined)
    },
    // 注释：查找对话数据
    getConversation: (type: string, key: string, name?: string): Conversation | undefined => {
      const mod = modLoader.getMod()
      if (!mod) return undefined
      return resolveConversation(mod.conversations, {
        type: type as ConversationRef['type'],
        character: type === 'character' ? key : undefined,
        name: type === 'character' || type === 'global' ? name ?? key : undefined,
        path: (type === 'quest' || type === 'event') ? key : undefined,
      })
    },
    // 注释：插值工具——{var} 替换
    interpolate: (text: string, context: any): string => {
      return interpolateText(text, context)
    },
    // 注释：注册场景角色过滤器（2026-08-10）——scene+charId 命中任一过滤器则跳过该角色口上。
    // filter 签名 (charId) => boolean；返回注销函数。
    registerSceneCharFilter: (scene: string, filter: (charId: string) => boolean): (() => void) => {
      const list = sceneCharFilters.get(scene) ?? []
      list.push(filter)
      sceneCharFilters.set(scene, list)
      return () => {
        const cur = sceneCharFilters.get(scene)
        if (!cur) return
        const idx = cur.indexOf(filter)
        if (idx >= 0) cur.splice(idx, 1)
      }
    },
  })

  // 注释：注册 talk 指令（从 native-commands 移除占位）
  commandRegistry.unregister('talk')
  const talkCmd: CommandDef = {
    id: 'talk',
    label: '交谈',
    group: 'character_commands',
    modes: ['exploration'],
    priority: 10,
    condition: 'selected != null',
    source: 'plugin:dialogue-system',
    handler: async (execCtx: any) => {
      const selectedId = execCtx?.uiStore?.selectedCharacterId
      if (!selectedId) return
      execCtx.uiStore.selectCharacter(selectedId)
      // 注释：用角色的第一个 conversation
      const mod = modLoader.getMod()
      const charConvs = mod?.conversations.character.get(selectedId)
      const firstName = charConvs ? Array.from(charConvs.keys())[0] : undefined
      if (firstName) {
        await startConversationInternal({ type: 'character', character: selectedId, name: firstName })
      } else {
        narrativeLog.write('（无话可说）', 'system', 'dialogue-system')
      }
    },
  }
  ctx.commands.register(talkCmd)

  // 注释：监听 location:enter → 触发 enter/greet 口上
  ctx.events.on('location:enter', async (payload: any) => {
    const locationId = payload?.to
    if (!locationId) return
    // 注释：场景通用口上（scene="enter" 或 scene=locationId）
    await triggerSceneInternal('enter')
    // 注释：遍历在场角色 → 对每个调 triggerScene('greet', charId)
    const mod = modLoader.getMod()
    if (!mod) return
    for (const char of entitySystem.getAll('character')) {
      const c = char as any
      if (c.id === gameContext.getContext().player?.id) continue // 注释：跳过玩家
      if (c.current_location === locationId) {
        await triggerSceneInternal('greet', c.id)
      }
    }
  })
}

async function executeLineEffects(line: ReactiveLine | null): Promise<void> {
  if (!line?.effects?.length) return
  try {
    await apiSystem.call('effect-system', 'execute', line.effects, {})
  } catch {
    // 注释：效果执行错误隔离，不阻断口上输出
  }
}

function resolveLineDisplay(line: ReactiveLine): Record<string, any> | undefined {
  if (!line.style && !line.display && line.trigger === undefined) return undefined
  const mod = modLoader.getMod()
  const resolved: Record<string, any> = {}
  // 注释：先查 [styles] 注册表
  if (line.style && mod?.styles?.[line.style]) {
    Object.assign(resolved, mod.styles[line.style])
  }
  // 注释：行级字段覆盖 style
  if (line.display) resolved.display = line.display
  if (line.trigger !== undefined) resolved.trigger = line.trigger
  if (line.speed !== undefined) resolved.speed = line.speed
  if (line.pause !== undefined) resolved.pause = line.pause
  if (line.color) resolved.color = line.color
  if (line.size) resolved.size = line.size
  if (line.font) resolved.font = line.font
  return resolved
}

// 注释：triggerScene 内部实现——三层口上匹配 + 纸娃娃兜底
async function triggerSceneInternal(scene: string, charId?: string): Promise<void> {
  const mod = modLoader.getMod()
  if (!mod) return

  let hasOutput = false

  // 注释：0. 事件 condition 检查——已完成的/活跃的跳过，未开始的求值
  // condition 满足 → auto start scene（不打断当前口上）
  try {
    const gc = gameContext.getContext()
    const { conditionEngine } = await import('../../core/condition-engine')
    const candidates = await apiSystem.call('quest', 'checkTriggerConditions')
    if (Array.isArray(candidates)) {
      for (const sid of candidates) {
        const sMod = modLoader.getMod()
        const sceneDef = sMod?.quests?.get?.(sid)
        if (!sceneDef?.condition) continue
        try {
          if (conditionEngine.evaluate(sceneDef.condition, gc)) {
            await apiSystem.call('quest', 'start', sid)
          }
        } catch { /* condition 求值失败，跳过 */ }
      }
    }
  } catch { /* quest API 未就绪，跳过 */ }

  // 注释：场景角色过滤（2026-08-10）——命中任一过滤器 → 跳过该角色的口上输出
  // 放在 quest 自动触发之后、口上选择之前：场景级任务触发不被抑制，角色说话被抑制
  if (charId && sceneCharFilters.get(scene)?.some((f) => f(charId))) return

  // 注释：1+2. 口上选择——同池权重竞争（erArk handle_talk_sub：通用 + 角色专属合并候选池，
  // 专属权重 ×draw_setting[14]（默认10）；pickWeightedLine 按权重区间随机选一）
  // T4 版本化：角色层口上按 character_text_version 过滤（erArk character_text_version，
  // 0=不启用角色口上；行 version 缺省=1）；场景通用恒参与
  // T5 无意识屏蔽：目标无意识（时停/睡眠/催眠）时，非 unconscious 前提的口上淘汰（erArk :224-237）
  // round 14 修复：原 `=== 3` 只匹配深度睡眠——sleep-system 无意识 H 用 1-2 级（浅睡/熟睡）
  // 时角色仍会出无前提口上（口径与 talk-common `>= 1` 不一致）。unconscious_h 值域：
  // 0=清醒，1-3=睡眠/无意识，4-7=催眠（时停）
  const char = charId ? entitySystem.get('character', charId) as any : null
  const charTextVersion = char?.character_text_version ?? 1
  const isUnconscious = (char?.sp_flag?.unconscious_h ?? 0) >= 1
  // 注释：无意识时所有口上（含场景通用）若无 unconscious 前提都淘汰（erArk :224-237）
  const keepConscious = (line: ReactiveLine): boolean => !isUnconscious || /unconscious/i.test(line.condition ?? '')
  const pool: { line: ReactiveLine; source: 'scene' | 'character'; multiplier: number }[] = []
  for (const l of mod.sceneDialogue) {
    if (l.scene === scene && keepConscious(l)) pool.push({ line: l, source: 'scene', multiplier: 1 })
  }
  if (charId) {
    const keepVersion = (line: ReactiveLine): boolean => (line.version ?? 1) === charTextVersion
    const specificLines = mod.characterSpecificDialogue.get(charId) ?? []
    for (const l of specificLines) {
      if (l.scene === scene && keepVersion(l) && keepConscious(l)) pool.push({ line: l, source: 'character', multiplier: 10 })
    }
    for (const l of mod.characterDialogue) {
      if (l.scene === scene && keepVersion(l) && keepConscious(l)) pool.push({ line: l, source: 'character', multiplier: 1 })
    }
  }
  const matched = pickWeightedLine(pool, charId)
  if (matched) {
    const entry = pool.find(p => p.line === matched.line)
    // 注释：T3 混合率——权重<100 的口上按 hConfig talk.common_mix_rate（默认30，对齐 erArk draw_setting[13]×10）
    // 随机替换为行为地文（erArk talk.py:244-254：not unusual_talk_flag or talk_weight < 100）
    const hc = (modLoader.getMod()?.hConfig as any) ?? {}
    const mixRate = hc?.talk?.common_mix_rate ?? 30
    const playerId = gameContext.getContext().player?.id
    let outputText: string | null = null
    let outputIsChar = entry?.source === 'character'
    if (charId && matched.weight < 100 && mixRate > 0) {
      try {
        const behaviorText = await apiSystem.call('talk-common', 'getBehaviorText', scene, charId, playerId)
        if (behaviorText && Math.random() * 100 < mixRate) {
          // 注释：行为地文含 {penis}/{target.name} 等占位符，必须与口上同路径插值
          // （漏插值会原样显示——2026-08-08 审查发现）
          outputText = await interpolateLine(behaviorText, charId)
          outputIsChar = false // 地文为叙述视角（erArk common_talk_flag）
        }
      } catch { /* talk-common 未就绪，走口上 */ }
    }
    if (outputText === null) {
      outputText = await interpolateLine(matched.line.text, charId)
    }
    const display = resolveLineDisplay(matched.line)
    if (outputIsChar && charId) {
      const char = entitySystem.get('character', charId) as any
      const speakerName = char?.name ?? charId
      narrativeLog.write(`${speakerName}：${outputText}`, 'dialogue', 'dialogue-system', undefined, undefined, display as any)
    } else {
      narrativeLog.write(outputText, 'dialogue', 'dialogue-system', undefined, undefined, display as any)
    }
    if (outputIsChar) {
      await executeLineEffects(matched.line)
    }
    hasOutput = true
  }

  // 注释：3. 纸娃娃兜底——无对口上时用行为地文（T3），再退 talk-common 变量兜底
  if (!hasOutput) {
    try {
      const playerId = gameContext.getContext().player?.id
      const fallback = await apiSystem.call('talk-common', 'getBehaviorText', scene, charId ?? null, playerId)
        ?? await apiSystem.call('talk-common', 'getText', scene, charId ?? null, playerId)
      if (fallback) {
        const interpolated = await interpolateLine(fallback, charId)
        if (charId) {
          const char = entitySystem.get('character', charId) as any
          const speakerName = char?.name ?? charId
          narrativeLog.write(`${speakerName}：${interpolated}`, 'dialogue', 'dialogue-system')
        } else {
          narrativeLog.write(interpolated, 'dialogue', 'dialogue-system')
        }
      }
    } catch {
      // 注释：talk-common 未就绪或无此场景文本，静默跳过
    }
  }
}

// 注释：从匹配的候选池中按权重区间随机选一条（erArk choice_talk_from_talk_data + get_rand_value_for_value_region）
// 权重 = 前提权重（high_N 累加 + 满足前提数，getWeight）× multiplier（角色专属×10）
// 静态 weight 字段优先（等价 erArk CVP_Weight|0 固定权重，固定后仍乘 multiplier——erArk talk.py:159 同）
// premiseTargetId — 触发口上的目标角色（用于 premise 求值，如 high_1 查谁的状态）
interface WeightedCandidate {
  line: ReactiveLine
  source: 'scene' | 'character'
  multiplier: number
}

function pickWeightedLine(pool: WeightedCandidate[], premiseTargetId?: string): { line: ReactiveLine; weight: number } | null {
  if (pool.length === 0) return null
  const gc = gameContext.getContext()
  const selectedId = premiseTargetId ?? gc.player?.id ?? null
  const premiseCtx = { selectedCharacterId: selectedId, sourceId: gc.player?.id ?? null }
  // 注释：{id} 占位符 = 当前角色（角色口上惯例，如 character.{id}.好感度）——
  // 不求值替换会变成查找角色 '{id}'（恒不存在 → 条件恒 true，静默失效）
  const substituteId = (cond: string) => cond.replace(/\{id\}/g, selectedId ?? '')

  const candidates: { line: ReactiveLine; weight: number }[] = []
  // 注释：T6 特殊情境加权（erArk handle_special_talk_weight，talk.py:168-223）——
  // 候选前提集与某情境 premises 有交集 → weight ×multiplier（每类最多一次，多类累计）
  const situations = (modLoader.getMod()?.hConfig as any)?.talk?.situations as { premises?: string[]; multiplier?: number }[] | undefined
  const applySituation = (premiseList: string[], weight: number): number => {
    if (!situations || premiseList.length === 0) return weight
    const has = new Set(premiseList.map(p => p.toLowerCase()))
    let w = weight
    for (const s of situations) {
      const mult = s.multiplier ?? 5
      const hit = (s.premises ?? []).some(p => has.has(p.toLowerCase()))
      if (hit) w *= mult
    }
    return w
  }
  for (const c of pool) {
    const line = c.line
    // 筛选 condition（两种格式：纯表达式 / premises:XXX&YYY 前提集）
    if (line.condition) {
      const cond = substituteId(line.condition)
      if (cond.startsWith('premises:')) {
        const premiseList = cond.slice(9).split('&').map(s => s.trim()).filter(Boolean)
        if (premiseList.length === 0) {
          candidates.push({ line, weight: Math.max(1, line.weight ?? 1) * c.multiplier })
          continue
        }
        // 注释：非严格——未知 erark 前提跳过（不阻塞）
        if (!premiseRegistry.evaluate(premiseList, premiseCtx, false)) continue
        const w = premiseRegistry.getWeight(premiseList, premiseCtx)
        const base = Math.max(1, line.weight ?? w) * c.multiplier
        candidates.push({ line, weight: applySituation(premiseList, base) })
      } else {
        try {
          if (!conditionEngine.evaluate(cond, gc)) continue
        } catch {
          continue
        }
        candidates.push({ line, weight: Math.max(1, line.weight ?? 1) * c.multiplier })
      }
    } else {
      candidates.push({ line, weight: Math.max(1, line.weight ?? 1) * c.multiplier })
    }
  }
  if (candidates.length === 0) return null
  // 权重区间随机（等价 erArk random.choices）
  const picked = weightedRandom(candidates.map(c => ({ item: c, weight: c.weight })))
  return { line: picked.line, weight: picked.weight }
}

// 注释：startConversation 内部实现（新版——使用 ConversationRef）
async function startConversationInternal(ref: ConversationRef, speaker?: string): Promise<void> {
  const mod = modLoader.getMod()
  if (!mod) return

  const selected = resolveConversation(mod.conversations, ref)
  if (!selected) {
    narrativeLog.write('（对话不存在）', 'system', 'dialogue-system')
    return
  }

  // 注释：构建 node map
  const nodes = new Map<string, ConversationNode>()
  for (const node of selected.nodes) {
    nodes.set(node.id, node)
  }

  // 注释：存说话者信息到运行时
  const defaultSpeaker = speaker ?? (ref.type === 'character' ? ref.character : undefined)

  currentConversation = {
    ref,
    convId: selected.id,
    nodeId: 'start',
    nodes,
  }
  gameContext.enterMode('dialogue')
  eventBus.emit('dialogue:start', { ref, conversationId: selected.id })

  // 注释：渲染 start node
  await renderNode('start', defaultSpeaker)
}

// 注释：渲染当前 node
async function renderNode(nodeId: string, speakerOverride?: string): Promise<void> {
  if (!currentConversation) return
  const node = currentConversation.nodes.get(nodeId)
  if (!node) return
  currentConversation.nodeId = nodeId

  // 注释：决定说话者——优先 lines 内的 speaker，回退到 speakerOverride，最后用 ref.character
  const charId = currentConversation.ref.type === 'character' ? currentConversation.ref.character : undefined
  const speakerName = speakerOverride ?? (charId ? (entitySystem.get('character', charId) as any)?.name ?? charId : undefined)

  // 注释：查找 speaker style（[styles.speaker.角色名]）
  const mod = modLoader.getMod()
  const speakerStyle = speakerName ? (mod as any)?.styles?.speaker?.[speakerName] : undefined

  // 注释：渲染 lines——speaker 作为元数据，不自动加前缀
  // speaker 由 UI 消费（样式/头像），mod 作者决定是否写在文字里
  for (const line of node.lines) {
    const interpolated = await interpolateLine(line, charId)
    eventBus.emit('dialogue:line', { speaker: speakerName ?? null, text: interpolated, style: speakerStyle })
    narrativeLog.write(interpolated, 'dialogue', 'dialogue-system', undefined, undefined, speakerStyle)
  }

  // 注释：执行 node effects
  if (node.effects?.length) {
    try {
      await apiSystem.call('effect-system', 'execute', node.effects, {})
    } catch {
      // 注释：效果执行错误隔离，不阻断对话流程
    }
  }

  // 注释：渲染 choices（如果有）
  if (node.choices && node.choices.length > 0) {
    // 注释：写入 interactive entry 供玩家选择
    narrativeLog.write('选择', 'dialogue_choice', 'dialogue-system', true, {
      choices: node.choices,
      conversationRuntime: currentConversation,
    })
  } else if (node.next) {
    // 注释：单选项自动跳转
    renderNode(node.next)
  } else {
    // 注释：终端节点——对话结束
    endConversation()
  }
}

// 注释：玩家选择 choice——由 UI 调用
// ⚠️ 标记（2026-08-09）：selectChoice 已导出但未注册到 API/事件通道——插件间禁止直接
// import，UI 实际无法调用 → 对话分支推进（choices.next / 分支节点 effects）当前不可达。
// 依赖 dialogue UI 交互通道设计（随 dialogue-system 补齐，勿局部修补）。
export async function selectChoice(entryId: string, choiceIndex: number): Promise<void> {
  if (!currentConversation) return
  const node = currentConversation.nodes.get(currentConversation.nodeId)
  if (!node?.choices || choiceIndex >= node.choices.length) return

  const choice = node.choices[choiceIndex]
  // 注释：标记当前 choice entry consumed
  narrativeLog.markConsumed(entryId)
  // 注释：跳转到 choice.next
  await renderNode(choice.next)
}

// 注释：结束对话
function endConversation(): void {
  if (!currentConversation) return
  const charId = currentConversation.ref.type === 'character' ? currentConversation.ref.character : undefined
  const convId = currentConversation.convId
  currentConversation = null
  gameContext.exitMode()
  eventBus.emit('dialogue:end', { character: charId ?? null, conversationId: convId })
}

// 注释：{var} 插值
// {player.name} → player entity 的 name
// {character.name} → 当前触发口上的角色名
// {location.name} → 当前地点名
// {time.hour} → 当前时间
// 未找到保留原样 {xxx}
async function interpolateLine(text: string, charId?: string): Promise<string> {
  const ctx = gameContext.getContext()
  const targetId = charId ?? ctx.player?.id ?? null

  // 注释：第1层——talk_common 替换 {vagina_s} {penis} 等
  const commonReplaced = await apiSystem.call('talk-common', 'replace', text, targetId) as string

  // 注释：第2层——标准插值 {player.name} {character.name} 等
  const context: any = {
    player: ctx.player,
    location: ctx.location,
    time: ctx.time,
  }
  if (charId) {
    const charData = entitySystem.get('character', charId) as any
    context.character = charData

    // 注释：target = 当前对话的交互对象（NPC说话时 = 玩家，玩家说话时 = 选中角色）
    const playerData = ctx.player as any
    const isPlayer = charId === playerData?.id
    const targetId = isPlayer
      ? (playerData as any)?.target_character_id ?? null
      : playerData?.id ?? null
    const targetData = targetId ? entitySystem.get('character', targetId) as any : null
    context.target = targetData ? {
      name: targetData.name ?? '',
      nickname: targetData.nick_name ?? targetData.name ?? '',
    } : playerData ? {
      name: playerData.name ?? '',
      nickname: playerData.name ?? '',
    } : undefined
  }
  return interpolateText(commonReplaced, context)
}

// 注释：通用插值函数——正则匹配 {xxx} 替换
function interpolateText(text: string, context: any): string {
  return text.replace(/\{(\w+)\.(\w+)\}/g, (match, objName, propName) => {
    const obj = context[objName]
    if (obj && obj[propName] !== undefined) {
      return String(obj[propName])
    }
    // 注释：未找到保留原样
    return match
  })
}
