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
import { evaluateCondition } from '../../core/condition'
import { premiseRegistry } from '../h-core/index'
import { effectTypeRegistry } from '../../core/effect-type-registry'

// 注释：对话运行时状态——当前在哪个 node
interface ConversationRuntime {
  charId: string
  convId: string
  nodeId: string
  nodes: Map<string, ConversationNode>
}

let currentConversation: ConversationRuntime | null = null

// 注释：onLoad——注册 effect types
export function onLoad(_ctx: PluginContext): void {
  // 注释：trigger_dialogue——指令执行后触发对口上
  effectTypeRegistry.register('trigger_dialogue', (params: any, execCtx: any) => {
    const scene = (params.scene as string) ?? execCtx._commandId
    if (!scene) return true
    const targetIds = execCtx._targetIds as string[]
    const charId = targetIds.length > 0 ? targetIds[0] : undefined
    triggerSceneInternal(scene, charId)
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
    triggerScene: (scene: string, charId?: string): void => {
      triggerSceneInternal(scene, charId)
    },
    // 注释：开始交互式对话——start_conversation effect / talk 指令调此方法
    // charId: 对话对象
    // conversationId: 可选指定对话，不传则自动选第一个 condition 满足的
    startConversation: (charId: string, conversationId?: string): void => {
      startConversationInternal(charId, conversationId)
    },
    // 注释：获取角色的对话列表
    getConversations: (charId: string): Conversation[] => {
      const mod = modLoader.getMod()
      return mod?.conversations.get(charId) ?? []
    },
    // 注释：插值工具——{var} 替换
    interpolate: (text: string, context: any): string => {
      return interpolateText(text, context)
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
      // 注释：设 selected = 对话对象
      execCtx.uiStore.selectCharacter(selectedId)
      // 注释：调 startConversation
      startConversationInternal(selectedId)
    },
  }
  ctx.commands.register(talkCmd)

  // 注释：监听 location:enter → 触发 enter/greet 口上
  ctx.events.on('location:enter', (payload: any) => {
    const locationId = payload?.to
    if (!locationId) return
    // 注释：场景通用口上（scene="enter" 或 scene=locationId）
    triggerSceneInternal('enter')
    // 注释：遍历在场角色 → 对每个调 triggerScene('greet', charId)
    const mod = modLoader.getMod()
    if (!mod) return
    for (const char of entitySystem.getAll('character')) {
      const c = char as any
      if (c.id === gameContext.getContext().player?.id) continue // 注释：跳过玩家
      if (c.current_location === locationId) {
        triggerSceneInternal('greet', c.id)
      }
    }
  })
}

// 注释：triggerScene 内部实现——三层口上匹配
function triggerSceneInternal(scene: string, charId?: string): void {
  const mod = modLoader.getMod()
  if (!mod) return

  // 注释：1. 场景通用口上——独立输出
  const sceneLines = mod.sceneDialogue.filter(line => line.scene === scene)
  const matchedSceneLine = pickMatchingLine(sceneLines)
  if (matchedSceneLine) {
    const interpolated = interpolateLine(matchedSceneLine.text, charId)
    narrativeLog.write(interpolated, 'dialogue', 'dialogue-system')
  }

  // 注释：2. 角色口上——有 charId 时才查
  if (charId) {
    // 注释：角色专属 > 角色通用
    const specificLines = mod.characterSpecificDialogue.get(charId) ?? []
    const matchedSpecific = pickMatchingLine(specificLines.filter(l => l.scene === scene))

    if (matchedSpecific) {
      const char = entitySystem.get('character', charId) as any
      const speakerName = char?.name ?? charId
      const interpolated = interpolateLine(matchedSpecific.text, charId)
      narrativeLog.write(`${speakerName}：${interpolated}`, 'dialogue', 'dialogue-system')
    } else {
      // 注释：角色通用 fallback
      const genericLines = mod.characterDialogue.filter(l => l.scene === scene)
      const matchedGeneric = pickMatchingLine(genericLines)
      if (matchedGeneric) {
        const char = entitySystem.get('character', charId) as any
        const speakerName = char?.name ?? charId
        const interpolated = interpolateLine(matchedGeneric.text, charId)
        narrativeLog.write(`${speakerName}：${interpolated}`, 'dialogue', 'dialogue-system')
      }
    }
  }
}

// 注释：从匹配的 lines 中按 condition 筛选后随机选一条
function pickMatchingLine(lines: ReactiveLine[]): ReactiveLine | null {
  if (lines.length === 0) return null
  const gc = gameContext.getContext()
  // 注释：筛选 condition 为 true 的条目
  const matched = lines.filter(line => {
    if (!line.condition) return true
    // 注释：premises:XXX,YYY 格式 → 调 h-core premise 求值
    if (line.condition.startsWith('premises:')) {
      const premiseList = line.condition.slice(9).split(',').map(s => s.trim()).filter(Boolean)
      if (premiseList.length === 0) return true
      return premiseRegistry.evaluate(premiseList, {
        selectedCharacterId: gc.player?.id ?? null,
        sourceId: gc.player?.id ?? null,
      })
    }
    // 注释：标准 condition 表达式
    try { return evaluateCondition(line.condition, gc) }
    catch { return false }
  })
  if (matched.length === 0) return null
  return matched[Math.floor(Math.random() * matched.length)]
}

// 注释：startConversation 内部实现
function startConversationInternal(charId: string, conversationId?: string): void {
  const mod = modLoader.getMod()
  if (!mod) return

  const conversations = mod.conversations.get(charId) ?? []
  if (conversations.length === 0) {
    narrativeLog.write('（无话可说）', 'system', 'dialogue-system')
    return
  }

  // 注释：选对话——指定 conversationId 或第一个 condition 满足的
  let selected: Conversation | undefined
  if (conversationId) {
    selected = conversations.find(c => c.id === conversationId)
  } else {
    // TODO: condition 求值——当前简化，选第一个
    selected = conversations[0]
  }

  if (!selected) {
    narrativeLog.write('（对话不存在）', 'system', 'dialogue-system')
    return
  }

  // 注释：构建 node map
  const nodes = new Map<string, ConversationNode>()
  for (const node of selected.nodes) {
    nodes.set(node.id, node)
  }

  // 注释：进入 dialogue mode + 设当前对话
  currentConversation = {
    charId,
    convId: selected.id,
    nodeId: 'start',
    nodes,
  }
  gameContext.enterMode('dialogue')
  eventBus.emit('dialogue:start', { character: charId, conversationId: selected.id })

  // 注释：渲染 start node
  renderNode('start')
}

// 注释：渲染当前 node
function renderNode(nodeId: string): void {
  if (!currentConversation) return
  const node = currentConversation.nodes.get(nodeId)
  if (!node) return
  currentConversation.nodeId = nodeId

  const char = entitySystem.get('character', currentConversation.charId) as any
  const speakerName = char?.name ?? currentConversation.charId

  // 注释：渲染 lines
  for (const line of node.lines) {
    const interpolated = interpolateLine(line, currentConversation.charId)
    eventBus.emit('dialogue:line', { speaker: speakerName, text: interpolated })
    narrativeLog.write(`${speakerName}：${interpolated}`, 'dialogue', 'dialogue-system')
  }

  // 注释：node effects——Phase 7 跳过（Phase 9 effect-system 接入后生效）
  // TODO(phase-9): 执行 node.effects

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
// TODO: 暴露此方法供 NarrativeLog 的 choice 交互调用
export function selectChoice(entryId: string, choiceIndex: number): void {
  if (!currentConversation) return
  const node = currentConversation.nodes.get(currentConversation.nodeId)
  if (!node?.choices || choiceIndex >= node.choices.length) return

  const choice = node.choices[choiceIndex]
  // 注释：标记当前 choice entry consumed
  narrativeLog.markConsumed(entryId)
  // 注释：跳转到 choice.next
  renderNode(choice.next)
}

// 注释：结束对话
function endConversation(): void {
  if (!currentConversation) return
  const charId = currentConversation.charId
  const convId = currentConversation.convId
  currentConversation = null
  gameContext.exitMode()
  eventBus.emit('dialogue:end', { character: charId, conversationId: convId })
}

// 注释：{var} 插值
// {player.name} → player entity 的 name
// {character.name} → 当前触发口上的角色名
// {location.name} → 当前地点名
// {time.hour} → 当前时间
// 未找到保留原样 {xxx}
function interpolateLine(text: string, charId?: string): string {
  const ctx = gameContext.getContext()
  const context: any = {
    player: ctx.player,
    location: ctx.location,
    time: ctx.time,
  }
  if (charId) {
    context.character = entitySystem.get('character', charId)
  }
  return interpolateText(text, context)
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
