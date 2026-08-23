// 注释：dialogue-system 插件——口上演出管线 + 交互式对话树
// 口上 = 演出——几乎所有指令执行后触发对应口上
// 三层口上：场景通用（scene-dialogue.toml）+ 角色通用（character-dialogue.toml，fallback）+ 角色专属（characters/dialogue/{charId}/dialogue.toml）
// 优先级：角色专属 > 角色通用，场景通用独立输出

import { conditionEngine, weightAllToOne, extractPremiseRefs } from '../../core/condition-engine'
import type { PluginContext } from '../../core/types'
import type { ReactiveLine, Conversation, ConversationNode } from '../../core/mod-loader'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { errorReporter } from '../../core/error-reporter'
import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import { modLoader } from '../../core/mod-loader'
import { commandRegistry } from '../../core/command-registry'
import type { CommandDef } from '../../core/command-registry'
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
  // 注释：当前可选项（2026-08-13 审计——原选择依赖 narrativeLog 按 entryId 查找，
  // core 日志淘汰（1000 条）后选择静默失效；运行时持有，选择直接按索引取）
  pendingChoices?: { text: string; next?: string; effects?: any[] }[]
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
  // 注释：对话选项选择推进（2026-08-13 审计修复——原 UI selectChoice 只有 TODO，
  // 玩家选择后对话树卡死；UI 发 dialogue:select，这里渲染下一节点。
  // 选择取运行时 pendingChoices（不依赖 narrativeLog 查找——日志淘汰后选择仍可用）；
  // handler 必须 await renderNode（事件总线串行 await）——UI 侧等待 emit 完成后再推进
  // 显示，否则新行未写入时 UI 已推进 → 对话行不可见）
  ctx.events.on('dialogue:select', async (payload: any) => {
    const index = Number(payload?.index ?? 0)
    if (!currentConversation) return
    const choice = currentConversation.pendingChoices?.[index]
    // 注释：G1-M-2——无 next 的选项按终端处理：先执行 effects 再结束对话
    //（原提前 return：effects 不执行 + 对话永久卡死零诊断；B-I-2 加载期校验
    // 拦不住 registerScene 运行时注册的坏对话数据）
    if (!choice) return
    await executeChoiceEffects(choice)
    if (choice.next) {
      await renderNode(choice.next)
    } else {
      await endConversation()
    }
  })

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
        // 注释：C2-3.2（audit-c2 3.2）——type=scene 时 key 映射到 scene 字段、
        // name 传对话树 id（原实现缺 scene 字段 → resolveConversation 恒 undefined）
        name: (type === 'character' || type === 'global' || type === 'scene') ? name ?? key : undefined,
        path: (type === 'quest' || type === 'event') ? key : undefined,
        scene: type === 'scene' ? key : undefined,
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
  // 2026-08-15 复查 I-2：时停中瞬移（含自动时停移动循环）跳过 enter/greet 口上——
  // ① 自动移动的"完全静默"承诺（enter 场景 charId=null 不受 T5 无意识屏蔽，会泄漏文本）
  // ② 时停中世界冻结，进入地点的场景描述与冻结角色的 greet 均无意义。
  // 同事件上 random-event/npc-ai 已守卫，此处对齐（可选集成：插件缺失 → 正常触发）。
  ctx.events.on('location:enter', async (payload: any) => {
    let tsActive = false
    try { tsActive = !!apiSystem.callSync('h-time-stop', 'isActive') } catch { /* 插件缺失 */ }
    if (tsActive) return
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

  // 注释：读档后清理进行中对话（2026-08-14 存档复刻）——存档只在非对话模式创建，
  // 防御性清空 currentConversation，防止残留引用指向读档前的旧实体
  ctx.events.on('game:load', () => {
    currentConversation = null
  })
}

// 注释：M5（audit-h）——对话效果执行上下文统一构造（node/choice/line 三处共用）。
// 语义：sourceId = 玩家；targetIds = 对话对象角色（character 型对话取 ref.character，
// scene/quest 型对话无固定角色 → 回退当前 UI 选中）；uiStore 供 effect 显式写
// target='selected' 时解析（effect-system resolveTarget 读 ctx.uiStore?.selectedCharacterId）
function buildDialogueExecCtx(charId: string | null | undefined): { sourceId: string | null; _targetIds: string[]; uiStore: { selectedCharacterId: string | null } } {
  const gc = gameContext.getContext()
  const dialogCharId = charId ?? gc.selectedCharacterId ?? null
  return {
    sourceId: gc.player?.id ?? null,
    _targetIds: dialogCharId ? [dialogCharId] : [],
    uiStore: { selectedCharacterId: dialogCharId },
  }
}

async function executeLineEffects(line: ReactiveLine | null, charId?: string | null): Promise<void> {
  if (!line?.effects?.length) return
  try {
    // 注释：G2-I-1——补口上执行上下文（原空 {}：effect target='selected'/'self'
    // 全部解析失败 → 口上行 effects 文档承诺功能实际失效）
    await apiSystem.call('effect-system', 'execute', line.effects, buildDialogueExecCtx(charId ?? null))
  } catch (err) {
    // 注释：audit-e I2——外层 catch 吞掉的是 API 管线错误（effect-system 未启用等，
    // effect-system 内部不会上报这类错误）→ 去重上报 warning，保留"不阻断口上输出"语义
    const key = `line-effects|${JSON.stringify(line.effects)}`
    errorReporter.reportDedup(key, {
        source: 'dialogue-system',
        severity: 'warning',
        message: `口上效果执行失败（已跳过，不阻断输出）：${err instanceof Error ? err.message : String(err)}`,
        suggestion: '检查 effect-system 插件是否启用、effects 数据类型是否正确',
      })

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

// 注释：纸娃娃地文配置解析（ADR 0017）——防静默越界/类型错误：
//   common_mix_rate      应为 0-100 数值（越界/非数值 → 去重 warning + 钳制回 [0,100]/默认 30，不崩口上）
//   behavior_text_enabled 应为布尔（TOML 写字符串 "false" 属常见脚枪 → warning + 按 true 处理）
// 返回钳制后的值供 triggerScene 使用；配置错误只报一次（reportDedup 按 key 去重）。
function readTalkBehaviorConfig(): { mixRate: number; behaviorTextEnabled: boolean } {
  const talk = (modLoader.getMod()?.hConfig as any)?.talk ?? {}
  let mixRate: unknown = talk.common_mix_rate
  if (mixRate === undefined) mixRate = 30
  if (typeof mixRate !== 'number' || !Number.isFinite(mixRate) || (mixRate as number) < 0 || (mixRate as number) > 100) {
    const clamped = typeof mixRate === 'number' && Number.isFinite(mixRate) ? Math.max(0, Math.min(100, mixRate as number)) : 30
    errorReporter.reportDedup('talk.common_mix_rate', {
        source: 'dialogue-system',
        severity: 'warning',
        message: `hConfig talk.common_mix_rate 非法（${String(mixRate)}）——应为 0-100 数值，已钳制回 ${clamped}`,
        suggestion: '检查 mod h-config 中 [talk] common_mix_rate 配置',
      })
    mixRate = clamped
  }
  let behaviorTextEnabled = true
  const raw: unknown = talk.behavior_text_enabled
  if (raw !== undefined) {
    if (typeof raw === 'boolean') {
      behaviorTextEnabled = raw
    } else {
      errorReporter.reportDedup('talk.behavior_text_enabled', {
          source: 'dialogue-system',
          severity: 'warning',
          message: `hConfig talk.behavior_text_enabled 非法（${String(raw)}）——应为布尔值，已按 true 处理`,
          suggestion: '检查 mod h-config 中 [talk] behavior_text_enabled 配置（TOML 布尔不要加引号）',
        })
    }
  }
  return { mixRate: mixRate as number, behaviorTextEnabled }
}

// 注释：triggerScene 内部实现——三层口上匹配 + 纸娃娃兜底
async function triggerSceneInternal(scene: string, charId?: string): Promise<void> {
  const mod = modLoader.getMod()
  if (!mod) return

  let hasOutput = false

  // 注释：0. 事件 condition 自动启动——统一委托 quest-system（M3 收敛：原 step-0
  // 在此复制"求值 condition + start"实现（借 checkTriggerConditions API，条件源
  // 还不一致）——quest 侧 checkAutoStart 是唯一实现，本处仅转发；时机语义由
  // quest 侧监听（location:enter/dialogue:end/combat:end）决定
  try {
    await apiSystem.call('quest', 'checkAutoStart')
  } catch {
    // 注释：quest API 未就绪（quest-system 插件未加载）→ 场景级自动触发整体降级跳过，
    // 属有意降级（无 quest 插件 = 无任务系统），不阻断口上输出
  }

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
  const playerId = gameContext.getContext().player?.id
  // 注释：纸娃娃地文配置（ADR 0017，T3 扩展）——hConfig [talk]：
  //   common_mix_rate：混合率（默认 30；0 = 只关混合、留兜底）
  //   behavior_text_enabled：总开关（默认 true；false = 混合 + 空池兜底全关）
  //   非法值由 readTalkBehaviorConfig 钳制/告警（防静默越界）
  const { mixRate, behaviorTextEnabled } = readTalkBehaviorConfig()
  if (charId) {
    const keepVersion = (line: ReactiveLine): boolean => (line.version ?? 1) === charTextVersion
    const specificLines = mod.characterSpecificDialogue.get(charId) ?? []
    for (const l of specificLines) {
      if (l.scene === scene && keepVersion(l) && keepConscious(l)) pool.push({ line: l, source: 'character', multiplier: 10 })
    }
    const genericLines = mod.characterDialogue.filter(l => l.scene === scene && keepVersion(l) && keepConscious(l))
    if (genericLines.length > 0) {
      for (const l of genericLines) pool.push({ line: l, source: 'character', multiplier: 1 })
    } else {
      // 注释：原生通用口上（2026-08-17）——角色通用口上（characterDialogue）的插件默认层：
      // mod 未写该 scene 的角色通用口上时，用 talk-common 默认词条（Layer 1）兜底，mod 可经
      // definitions/talk-common/ 覆盖。词条内部已完成加权随机（high_N 等前提），作为单条
      // 普通权重候选参与同池竞争（= erArk 通用口上 + 角色专属口上合并候选池语义，专属×10
      // 优先；不设 weight 字段 = 前提权重 1，与 mod 角色通用口上行同级）。
      // 混合率：低权重行可被替换为行为地文——chat 等无行为地文数据时替换空转无害
      // （getBehaviorText 返回 null 不替换），与 erArk 低权重口上参与混合率语义一致。
      // 无意识时 keepConscious 自然淘汰（补入行无 condition，与无条件场景口上同语义）——
      // 故无意识时直接跳过补位（getText 对非 action_ 词条 unconsciousPass=true 会返回文本，
      // 但 pool 的 keepConscious 不覆盖补入行，需在此拦截）。
      // charTextVersion=0（不启用角色口上，erArk character_text_version）→ 补位同步禁用
      if (!isUnconscious && charTextVersion > 0) {
        try {
          const defaultTalk = await apiSystem.call('talk-common', 'getText', scene, charId, playerId)
          if (defaultTalk) {
            pool.push({ line: { scene, text: defaultTalk }, source: 'character', multiplier: 1 })
          }
        } catch {
          // 注释：talk-common 未就绪或无此场景词条 → 无原生默认口上（保持既有行为）
        }
      }
    }
  }
// 注释：场景级默认口上兜底（2026-08-xx）——无 charId（无目标/单人行动）且 mod 未写该
  // scene 的场景口上时，用 talk-common 默认词条兜底；与角色级兜底同语义，仅少一层角色轨。
  if (!charId) {
    const hasSceneLine = pool.some(p => p.source === 'scene')
    if (!hasSceneLine) {
      try {
        const defaultTalk = await apiSystem.call('talk-common', 'getText', scene, null, playerId)
        if (defaultTalk) {
          pool.push({ line: { scene, text: defaultTalk }, source: 'scene', multiplier: 1 })
        }
      } catch {
        // talk-common 未就绪或无此场景词条 → 无原生默认口上（保持既有行为）
      }
    }
  }
  const matched = pickWeightedLine(pool, charId)
  if (matched) {
    const entry = pool.find(p => p.line === matched.line)
    // 注释：T3 混合率——权重<100 的角色口上按 hConfig talk.common_mix_rate（默认30，对齐
    // erArk draw_setting[13]×10）随机替换为行为地文（erArk talk.py:244-254：not unusual_talk_flag
    // or talk_weight < 100）。范围守卫（2026-08 定稿，ADR 0017）：
    //   · entry.source==='character'——场景旁白层不参与混合替换（旁白是环境叙述，换成角色
    //     身体地文语义断裂；erArk 池中无旁白层，本层为我们自有决策）
    //   · behaviorTextEnabled（talk.behavior_text_enabled，默认 true）——总开关：false 时混合
    //     与空池兜底两条纸娃娃路径全关（对齐 erArk draw_setting[2]=0 的纸娃娃一侧）
    //   · matched.weight < 100——任意来源（场景/通用/专属）权重≥100 一律保护（有意的偏离：
    //     erArk 只保角色专属高权重；我们通用层是 mod 世界观内容层，与专属同权保护）
    let outputText: string | null = null
    let outputIsChar = entry?.source === 'character'
    // 注释：行为地文替换标记（审计修复 2026-08）——被替换的行 ≈ "没被说出"，其 effects 不执行
    // （与 erArk 置空 talk_id 语义一致）；且带 effects 的角色行明确排除出混合池（下方守卫），
    // 杜绝"作者写了 effects 却没触发"的静默丢失
    let replacedByBehavior = false
    if (charId && entry?.source === 'character' && !matched.line.effects?.length && matched.weight < 100 && mixRate > 0 && behaviorTextEnabled) {
      try {
        const behaviorText = await apiSystem.call('talk-common', 'getBehaviorText', scene, charId, playerId)
        if (behaviorText && Math.random() * 100 < mixRate) {
          // 注释：行为地文含 {penis}/{target.name} 等占位符，必须与口上同路径插值
          // （漏插值会原样显示——2026-08-08 审查发现）
          outputText = await interpolateLine(behaviorText, charId)
          outputIsChar = false // 地文为叙述视角（erArk common_talk_flag）
          replacedByBehavior = true
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
    // 注释：口上 effects 执行（审计修复 2026-08）——原按 outputIsChar 门控：场景旁白行
    // （source==='scene'）outputIsChar=false → 场景口上 effects 静默从不执行（文档承诺的
    // start_conversation/start_quest 等全失效）。改为：任何来源的命中行，只要未被行为地文
    // 替换且带 effects，都执行（替换后 = 该行没被说出 → 不跑）
    if (!replacedByBehavior && matched.line.effects?.length) {
      await executeLineEffects(matched.line, charId)
    }
    hasOutput = true
  }

  // 注释：3. 行为地文兜底——无对口上时用行为地文（T3，H 行为专用 A+B+C 组合），
  // 再退 talk-common 变量兜底。行为级默认口上（原生通用口上）由上方角色通用轨补位负责
  // （getText），此处不再重复查询（2026-08-17 收敛——原 getText 分支为死代码）。
  // 总开关（talk.behavior_text_enabled=false）时兜底一并关闭 → 池空即静默（ADR 0017）
  if (!hasOutput && behaviorTextEnabled) {
    try {
      const playerId = gameContext.getContext().player?.id
      const fallback = await apiSystem.call('talk-common', 'getBehaviorText', scene, charId ?? null, playerId)
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
// 权重 = 前提权重（high_N 累加 + 满足前提数，weightAllToOne）× multiplier（角色专属×10）
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
  const premiseCtx = { ...gc, selectedCharacterId: selectedId ?? undefined, sourceId: gc.player?.id ?? null }
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
    if (line.condition) {
      const cond = substituteId(line.condition)
      // 注释：条件 = 完整表达式（premise(X) 命名引用内联）；未知前提（校验层拦截漏网）
      // 或语法错误 → 跳过该候选，不崩口上（去重上报——2026-08-13 审计：原静默淘汰口上行，
      // 表达式错误时行永远不出且无痕迹）；求值上下文 = premiseCtx（selected 指向口上目标）
      try {
        if (!conditionEngine.evaluate(cond, premiseCtx)) continue
      } catch (err) {
        errorReporter.reportDedup(cond, {
            source: 'dialogue-system',
            severity: 'warning',
            message: `口上条件求值失败（该行被跳过）：${err instanceof Error ? err.message : String(err)}`,
            suggestion: '检查口上 condition 表达式（字段路径/前提拼写）',
          })

        continue
      }
      // 注释：前提权重（premise(X) 引用提取 → weightAllToOne；无条件/无前提引用 → 静态权重）
      const premiseList = extractPremiseRefs(cond)
      const w = premiseList.length > 0 ? weightAllToOne(premiseList, premiseCtx) : Math.max(1, line.weight ?? 1)
      const base = Math.max(1, line.weight ?? w) * c.multiplier
      candidates.push({ line, weight: applySituation(premiseList, base) })
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
    // 注释：对话引用不存在 = 数据错误（2026-08-13 审计补上报——原仅用户提示，
    // mod 引用了未定义的对话时静默无痕迹）
    errorReporter.report({
      source: 'dialogue-system',
      severity: 'warning',
      message: `对话不存在：${JSON.stringify(ref)}`,
      suggestion: '检查对话引用（conversations/ 目录是否定义了该对话，或 quest/conversation 引用的 id 是否拼写正确）',
    })
    narrativeLog.write('对话不存在', 'system', 'dialogue-system')
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

// 注释：渲染当前 node——外层兜底（audit-e C1）：renderNodeInner 内任何意外抛错
//（对话数据损坏/管线错误）都会穿过对话模式 → 玩家永久卡 dialogue 模式（软死锁，
// 无任何 exitMode/currentConversation 清理）。上报（含 conversationId+nodeId）后
// endConversation 强制结束（endConversation 对已结束状态幂等）
async function renderNode(nodeId: string, speakerOverride?: string): Promise<void> {
  if (!currentConversation) return
  try {
    await renderNodeInner(nodeId, speakerOverride)
  } catch (err) {
    errorReporter.report({
      source: 'dialogue-system',
      severity: 'error',
      message: `对话 '${currentConversation?.convId ?? '?'}' 渲染节点 '${nodeId}' 失败（对话已强制结束）：${err instanceof Error ? err.message : String(err)}`,
      suggestion: '检查对话数据（节点字段类型/lines 格式/effects 引用）——加载期校验外的运行期数据需自查',
    })
    await endConversation()
  }
}

async function renderNodeInner(nodeId: string, speakerOverride?: string): Promise<void> {
  if (!currentConversation) return
  const node = currentConversation.nodes.get(nodeId)
  if (!node) {
    // 注释：B-I-2 配套（audit-b I-2）——缺失节点兜底——原静默 return：玩家点击坏
    // 选项后对话无输出、currentConversation 永不清空、dialogue 模式永不退出——
    // 永久卡死且零诊断。加载期校验（mod-loader）拦不住运行期构造的对话数据，
    // 此处上报 error + endConversation（防卡死双保险）
    errorReporter.report({
      source: 'dialogue-system',
      severity: 'error',
      message: `对话 '${currentConversation.convId}' 引用了不存在的节点 '${nodeId}'（对话已强制结束）`,
      suggestion: '检查对话树的 choices[].next / next 是否指向已定义节点（加载期校验应已拦截，运行期数据需自查）',
    })
    await endConversation()
    return
  }
  currentConversation.nodeId = nodeId

  // 注释：决定说话者——优先 lines 内的 speaker，回退到 speakerOverride，最后用 ref.character
  const charId = currentConversation.ref.type === 'character' ? currentConversation.ref.character : undefined
  const speakerName = speakerOverride ?? (charId ? (entitySystem.get('character', charId) as any)?.name ?? charId : undefined)

  // 注释：查找 speaker style（[styles.speaker.角色名]）
  const mod = modLoader.getMod()
  const speakerStyle = speakerName ? (mod as any)?.styles?.speaker?.[speakerName] : undefined

  // 注释：渲染 lines——speaker 作为元数据，不自动加前缀
  // speaker 由 UI 消费（样式/头像），mod 作者决定是否写在文字里
  // audit-e C1/M5：缺 lines 或 lines 为字符串 → 去重上报 + 兜底渲染（原缺 lines
  // 抛裸 TypeError 软死锁、字符串逐字符输出零报错）
  const rawLines = node.lines
  if (rawLines == null) {
    const key = `lines-missing|${currentConversation.convId}|${nodeId}`
    errorReporter.reportDedup(key, {
        source: 'dialogue-system',
        severity: 'warning',
        message: `对话 '${currentConversation.convId}' 节点 '${nodeId}' 缺少 lines 字段（按空行处理）`,
        suggestion: '对话节点声明 lines = ["一句台词"]（纯选择节点也建议至少一行空台词）',
      })

  } else if (!Array.isArray(rawLines)) {
    const key = `lines-type|${currentConversation.convId}|${nodeId}`
    errorReporter.reportDedup(key, {
        source: 'dialogue-system',
        severity: 'warning',
        message: `对话 '${currentConversation.convId}' 节点 '${nodeId}' 的 lines 必须是数组（当前是 ${typeof rawLines}，按单行处理）`,
        suggestion: 'lines 用表数组写法：lines = ["一句台词"]（单字符串会被逐字符输出）',
      })

  }
  const lines = Array.isArray(rawLines) ? rawLines : (rawLines == null ? [] : [rawLines])
  for (const line of lines) {
    const interpolated = await interpolateLine(line, charId)
    eventBus.emit('dialogue:line', { speaker: speakerName ?? null, text: interpolated, style: speakerStyle })
    narrativeLog.write(interpolated, 'dialogue', 'dialogue-system', undefined, undefined, speakerStyle)
  }

  // 注释：执行 node effects
  if (node.effects?.length) {
    try {
      // 注释：链路修复（2026-08-15）——原 execCtx 空 {}：effect target='selected'
      // 解析读 uiStore、h_start_h 等依赖 sourceId 的 effect 直接失效——补对话上下文
      await apiSystem.call('effect-system', 'execute', node.effects, buildDialogueExecCtx(charId))
    } catch (err) {
      // 注释：audit-e I2——外层 catch 吞掉的是 API 管线错误（effect-system 未启用等，
      // effect-system 内部不会上报这类错误）→ 去重上报 warning，保留"不阻断对话"语义
      const key = `node-effects|${currentConversation.convId}|${nodeId}|${JSON.stringify(node.effects)}`
      errorReporter.reportDedup(key, {
          source: 'dialogue-system',
          severity: 'warning',
          message: `对话 '${currentConversation.convId}' 节点 '${nodeId}' 的效果执行失败（已跳过，不阻断对话）：${err instanceof Error ? err.message : String(err)}`,
          suggestion: '检查 effect-system 插件是否启用、effects 数据类型是否正确',
        })

    }
  }

  // 注释：渲染 choices（如果有）
  if (node.choices && node.choices.length > 0) {
    // 注释：choices condition 过滤（2026-08-13 审计修复——原 condition 字段从未求值，
    // UI 直接渲染全部选项，不满足条件的选项可被点击绕过；selected = 对话角色）
    const gc = { ...gameContext.getContext(), selectedCharacterId: charId ?? undefined }
    const convId = currentConversation.convId
    const convNodeId = currentConversation.nodeId
    const visible = node.choices.filter(c => {
      if (!c.condition) return true
      try {
        return conditionEngine.evaluate(c.condition.replace(/\{id\}/g, charId ?? ''), gc)
      } catch (err) {
        // 注释：audit-e I1——选项 condition 求值失败静默淘汰该选项（玩家永远看不到、
        // 零上报）→ 镜像口上条件（reportedLineConditionErrors）的去重上报模式
        const key = `choice-cond|${convId}|${convNodeId}|${c.condition}`
        errorReporter.reportDedup(key, {
            source: 'dialogue-system',
            severity: 'warning',
            message: `对话 '${convId}' 节点 '${convNodeId}' 的选项条件求值失败（该选项被隐藏）：${err instanceof Error ? err.message : String(err)}`,
            suggestion: '检查选项 condition 表达式（字段路径/前提拼写）',
          })

        return false
      }
    })
    if (visible.length === 0) {
      // 注释：全部选项被条件隐藏——视为终端节点（避免死对话）
      if (node.next) {
        // 注释：G2-M-2——补 await（原缺 await：链式渲染与调用方推进竞态）
        await renderNode(node.next)
      } else {
        await endConversation()
      }
      return
    }
    // 注释：写入 interactive entry 供玩家选择（运行时同时持有——选择推进不依赖日志条目）
    currentConversation.pendingChoices = visible
    narrativeLog.write('选择', 'dialogue_choice', 'dialogue-system', true, {
      choices: visible,
      conversationRuntime: currentConversation,
    })
  } else if (node.next) {
    // 注释：单选项自动跳转（await——链式渲染完成后再返回，保证行写入时序）
    await renderNode(node.next)
  } else {
    // 注释：终端节点——对话结束
    await endConversation()
  }
}

// 注释：执行 choice 级 effects（链路修复 2026-08-15——原 choice.effects 死功能：
// 两个选择通道（dialogue:select 事件 / selectChoice）都只跳 node，choice 级 effects
// 从未执行。执行上下文与 node/line effects 统一（buildDialogueExecCtx））
async function executeChoiceEffects(choice: { effects?: any[] }): Promise<void> {
  if (!currentConversation || !choice.effects?.length) return
  const charId = currentConversation.ref.type === 'character' ? currentConversation.ref.character : undefined
  try {
    await apiSystem.call('effect-system', 'execute', choice.effects, buildDialogueExecCtx(charId))
  } catch (err) {
    const key = `choice-effects|${currentConversation.convId}|${currentConversation.nodeId}|${JSON.stringify(choice.effects)}`
    errorReporter.reportDedup(key, {
        source: 'dialogue-system',
        severity: 'warning',
        message: `对话 '${currentConversation.convId}' 节点 '${currentConversation.nodeId}' 的选项效果执行失败（已跳过，不阻断对话）：${err instanceof Error ? err.message : String(err)}`,
        suggestion: '检查 effect-system 插件是否启用、effects 数据类型是否正确',
      })

  }
}

// 注释：玩家选择 choice——生产 UI 走 dialogue:select 事件通道（本函数保留供
// 测试/脚本化调用，行为与事件通道一致：过滤后索引 + choice effects + 终端处理）
export async function selectChoice(entryId: string, choiceIndex: number): Promise<void> {
  if (!currentConversation) return
  // 注释：G1-I-3——改从 pendingChoices（condition 过滤后的可见列表）取值——
  // 原按原始 node.choices 索引：某选项被 condition 隐藏时下标错位，会选中
  // 不可见选项（配合 choice effects 管线 = 执行了本不该可见的 effects）。
  // 与 dialogue:select 事件通道同源，行为一致
  const choices = currentConversation.pendingChoices
  const choice = choices?.[choiceIndex]
  if (!choice) return
  // 注释：标记当前 choice entry consumed
  narrativeLog.markConsumed(entryId)
  // 注释：链路修复（2026-08-15）——choice.effects 死功能：原只跳 node，
  // choice 级 effects 从未执行——先执行 effects 再渲染
  await executeChoiceEffects(choice)
  // 注释：跳转到 choice.next（无 next = 终端选项：结束对话，与 dialogue:select 一致）
  if (choice.next) {
    await renderNode(choice.next)
  } else {
    await endConversation()
  }
}

// 注释：结束对话
async function endConversation(): Promise<void> {
  if (!currentConversation) return
  const charId = currentConversation.ref.type === 'character' ? currentConversation.ref.character : undefined
  const convId = currentConversation.convId
  currentConversation = null
  // 注释：链路修复（2026-08-15）——只弹 dialogue 模式，保留其上的嵌套模式：
  // 原无条件 exitMode() 弹栈顶——对话内 choice effect 推入的新模式（如 h_start_h
  // 进入的 h_scene）会被对话收尾一并弹掉（玩家选择"好"开始 H 后对话结束 → H 被
  // 意外退出）。弹出 dialogue 后把其上的模式按原序推回
  const above: string[] = []
  while (gameContext.getCurrentMode() !== 'exploration' && gameContext.getCurrentMode() !== 'dialogue') {
    above.push(gameContext.getCurrentMode())
    await gameContext.exitMode()
  }
  if (gameContext.getCurrentMode() === 'dialogue') {
    await gameContext.exitMode()
  }
  for (const m of above.reverse()) {
    await gameContext.enterMode(m)
  }
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
