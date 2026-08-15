// h-exposure 集成测试——露出系统完整复刻（2026-08-15）
// 全插件加载（PluginManager，sleep-system.test.ts 同款）；事件走真实 eventBus；断言到具体值
// 覆盖：露出持续快感 tick（迁自 hidden-sex-realtime.test.ts）、动态模式切换矩阵、
//   前提真值（erArk 原名 11 个）、露出经验、成就记录（exhibitionism_sex_record + 931/932/933）、
//   邀请露出/结束露出指令（前提矩阵 + 效果链 + h:end 清 mode）、卫生检查（has_indoor 覆盖）

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { modLoader } from '../core/mod-loader'
import { gameContext } from '../core/game-context'
import { entitySystem } from '../core/entity-system'
import { eventBus } from '../core/event-bus'
import { apiSystem } from '../core/api'
import { commandRegistry } from '../core/command-registry'
import { commandExecutor } from '../core/command-executor'
import { conditionEngine } from '../core/condition-engine'
import { conditionRegistry } from '../core/condition-registry'
import { errorReporter } from '../core/error-reporter'
import { bindingResolver } from '../core/binding-resolver'
import { PluginManager } from '../core/plugin-manager'
import { SlotRegistry } from '../ui/slots/slot-registry'
import { makeTestExecCtx, resetCharacterEntity, DEFAULT_NPC_BASE, DEFAULT_PLAYER_BASE } from '../utils/test-helpers'
import { computeModeByScene, updateExhibitionismMode, checkIndoorTagCoverage } from './h-exposure/scene'

const PLAYER = 'player'
const NPC = 'npc_1'
const PASSERBY = 'passerby'

function getChar(id: string): any {
  return entitySystem.get('character', id) as any
}

function premiseCtx(overrides: any = {}): any {
  return { ...gameContext.getContext(), sourceId: PLAYER, selectedCharacterId: NPC, ...overrides }
}

describe('h-exposure 露出系统集成', () => {
  beforeAll(async () => {
    entitySystem.clear()
    commandRegistry.clear()
    errorReporter.clear()
    conditionEngine.clear()

    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()
    if (!mod) throw new Error('模组加载失败')
    bindingResolver.loadBindings(mod.bindings)
    conditionRegistry.clear()
    conditionRegistry.registerFromAttributes(mod.attributes)
    conditionRegistry.registerFromBindings(mod.bindings)

    // 注释：tavern 已带 has_indoor（mods/test-mod/maps/locations/map.toml 数据，
    // 室内判定测试用；数据改动在插件 onEnable（卫生检查）之前生效，无 warning）

    gameContext.setPlayer(PLAYER)
    gameContext.setLocation(mod.locations.get('town_square') as any)

    const pluginManager = new PluginManager(apiSystem, eventBus, new SlotRegistry(), commandRegistry)
    const pluginModules = import.meta.glob('/src/plugins/*/index.ts', { eager: true }) as Record<string, any>
    const pluginTomls = import.meta.glob('/src/plugins/*/plugin.toml', { import: 'default', eager: true }) as Record<string, string>
    const enginePlugins = new Map<string, { toml: string; module?: any }>()
    for (const [path, toml] of Object.entries(pluginTomls)) {
      const dirName = path.match(/\/src\/plugins\/([^/]+)\//)?.[1]
      if (!dirName) continue
      enginePlugins.set(dirName, { toml, module: pluginModules[`/src/plugins/${dirName}/index.ts`] ?? undefined })
    }
    await pluginManager.loadPlugins(enginePlugins, new Map())

    const p = getChar(PLAYER)
    resetCharacterEntity(p, DEFAULT_PLAYER_BASE)
    p.current_location = 'town_square'
    entitySystem.register('character', NPC, { id: NPC, name: '测试NPC', base: {}, current_location: 'town_square' })
    resetCharacterEntity(getChar(NPC), DEFAULT_NPC_BASE)
    entitySystem.register('character', PASSERBY, { id: PASSERBY, name: '路人', base: {}, current_location: 'town_square' })
    resetCharacterEntity(getChar(PASSERBY), DEFAULT_NPC_BASE)
  })

  beforeEach(() => {
    errorReporter.clear()
    isolateScene()
  })

  // 注释：场景隔离——test-mod roster 角色经 character-system 全量注册后同城分布，
  // 会污染"场景人数"计数（动态切换/持续快感/成就 rec[2] 全依赖同地点计数）；
  // 非测试角色一律移到 'elsewhere'（npc-ai 可能在时间推进时移动它们，beforeEach 重复隔离）
  function isolateScene(): void {
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (c.id !== PLAYER && c.id !== NPC && c.id !== PASSERBY) {
        c.current_location = 'elsewhere'
      }
    }
  }

  afterEach(async () => {
    // 注释：重置角色状态（防跨测试污染）+ 退出模式——漏 sp_flag/h_state 会让切换/成就测试污染后续
    for (const id of [PLAYER, NPC, PASSERBY]) {
      const ch = getChar(id)
      ch.sp_flag = {}
      ch.h_state = undefined
      ch.achievement = undefined
      ch.experience = {}
      ch.base['羞耻'] = 0
      ch.base['心理'] = 0
      ch.abilities = {}
      ch.current_location = 'town_square'
    }
    if (gameContext.getCurrentMode() !== 'exploration') {
      while (gameContext.getCurrentMode() !== 'exploration') {
        await gameContext.exitMode()
      }
    }
  })

  async function tick(minutes: number): Promise<void> {
    // 注释：露出持续快感/经验/动态切换在 H 行动中结算（execution_end 监听要求 h_scene 模式）
    if (gameContext.getCurrentMode() !== 'h_scene') await gameContext.enterMode('h_scene')
    await eventBus.emit('game:execution_end', { commandId: 'test', timeCost: minutes })
  }

  describe('露出持续快感（realtime_settle.py:610-613，迁自 hidden-sex-realtime.test.ts）', () => {
    it('露出模式 → 羞耻/心理 += 30 × (1.0 + min(1×0.1,2)) = 33', async () => {
      const n = getChar(NPC)
      n.sp_flag = { exhibitionism_sex_mode: 1 }
      await tick(10)
      expect(n.base['羞耻']).toBe(33)
      expect(n.base['心理']).toBe(33)
    })

    it('露出能力等级生效：露出 lv5（adjust 1.8）→ 30 × (1.8 + 0.1) = 57', async () => {
      const n = getChar(NPC)
      n.sp_flag = { exhibitionism_sex_mode: 2 }
      n.abilities = { 露出: { level: 5, xp: 0 } }
      await tick(10)
      expect(n.base['羞耻']).toBe(Math.floor(30 * (1.8 + 0.1)))
    })

    it('非露出模式 → 不结算', async () => {
      const n = getChar(NPC)
      await tick(10)
      expect(n.base['羞耻']).toBe(0)
      expect(n.base['心理']).toBe(0)
    })
  })

  describe('动态模式切换（update_exhibiionism_sex_mode——12-露出系统.md §3）', () => {
    it('场景 2 人 + 无 has_indoor 地点 → 模式 2（室外露出）', () => {
      const n = getChar(NPC)
      n.sp_flag = { exhibitionism_sex_mode: 1 }
      n.sp_flag.target_character_id = PLAYER
      getChar(PASSERBY).current_location = 'elsewhere'
      expect(updateExhibitionismMode(NPC)).toBe(2)
      expect(n.sp_flag.exhibitionism_sex_mode).toBe(2)
    })

    it('场景 2 人 + has_indoor 地点 → 模式 1（室内露出）', () => {
      const n = getChar(NPC)
      n.sp_flag = { exhibitionism_sex_mode: 1 }
      n.sp_flag.target_character_id = PLAYER
      n.current_location = 'tavern'
      getChar(PLAYER).current_location = 'tavern'
      getChar(PASSERBY).current_location = 'elsewhere'
      expect(updateExhibitionismMode(NPC)).toBe(1)
    })

    it('场景 >2 人 + 有清醒旁观者 → 模式 3（人前露出）', () => {
      const n = getChar(NPC)
      n.sp_flag = { exhibitionism_sex_mode: 1 }
      n.sp_flag.target_character_id = PLAYER
      n.current_location = 'town_square'
      getChar(PLAYER).current_location = 'town_square'
      getChar(PASSERBY).current_location = 'town_square'
      expect(updateExhibitionismMode(NPC)).toBe(3)
    })

    it('场景 >2 人 + 旁观者全部无意识/睡眠 → 模式 4（无意识人前）', () => {
      const n = getChar(NPC)
      n.sp_flag = { exhibitionism_sex_mode: 1 }
      n.sp_flag.target_character_id = PLAYER
      getChar(PLAYER).current_location = 'town_square'
      getChar(PASSERBY).current_location = 'town_square'
      getChar(PASSERBY).sp_flag = { sleeping: true, unconscious_h: 1 }
      expect(updateExhibitionismMode(NPC)).toBe(4)
    })

    it('模式 0（非露出）→ 不切换，保持 0', () => {
      const n = getChar(NPC)
      n.sp_flag = { exhibitionism_sex_mode: 0 }
      expect(updateExhibitionismMode(NPC)).toBe(0)
      expect(n.sp_flag.exhibitionism_sex_mode).toBe(0)
    })

    it('computeModeByScene 供邀请露出初始模式（场景 2 人 + 无 tag → 2）', () => {
      const n = getChar(NPC)
      n.sp_flag = { exhibitionism_sex_mode: 0 }
      n.sp_flag.target_character_id = PLAYER
      getChar(PASSERBY).current_location = 'elsewhere'
      expect(computeModeByScene(NPC)).toBe(2)
    })
  })

  describe('露出前提真值（erArk 原名，constant_promise.py:1664-1689）', () => {
    it('自己模式 0：EXHIBITIONISM_SEX_MODE_0 真 / _1 假 / GE_1 假', () => {
      getChar(PLAYER).sp_flag = { exhibitionism_sex_mode: 0 }
      expect(conditionEngine.evaluate('premise(EXHIBITIONISM_SEX_MODE_0)', premiseCtx())).toBe(true)
      expect(conditionEngine.evaluate('premise(EXHIBITIONISM_SEX_MODE_1)', premiseCtx())).toBe(false)
      expect(conditionEngine.evaluate('premise(EXHIBITIONISM_SEX_MODE_GE_1)', premiseCtx())).toBe(false)
    })

    it('自己模式 2：EXHIBITIONISM_SEX_MODE_2 真（维度=自己，非目标）', () => {
      getChar(PLAYER).sp_flag = { exhibitionism_sex_mode: 2 }
      expect(conditionEngine.evaluate('premise(EXHIBITIONISM_SEX_MODE_2)', premiseCtx())).toBe(true)
      // 目标（npc_1）模式 0 → TARGET_ 版为假
      expect(conditionEngine.evaluate('premise(TARGET_EXHIBITIONISM_SEX_MODE_2)', premiseCtx())).toBe(false)
    })

    it('目标模式 3：TARGET_EXHIBITIONISM_SEX_MODE_3/GE_1 真，TARGET_NOT_IN_ 假', () => {
      getChar(NPC).sp_flag = { exhibitionism_sex_mode: 3 }
      expect(conditionEngine.evaluate('premise(TARGET_EXHIBITIONISM_SEX_MODE_3)', premiseCtx())).toBe(true)
      expect(conditionEngine.evaluate('premise(TARGET_EXHIBITIONISM_SEX_MODE_GE_1)', premiseCtx())).toBe(true)
      expect(conditionEngine.evaluate('premise(TARGET_NOT_IN_EXHIBITIONISM_SEX_MODE)', premiseCtx())).toBe(false)
    })

    it('PLAYER_NOT_IN_EXHIBITIONISM_SEX_MODE：玩家维度', () => {
      getChar(PLAYER).sp_flag = { exhibitionism_sex_mode: 0 }
      getChar(NPC).sp_flag = { exhibitionism_sex_mode: 1 }
      expect(conditionEngine.evaluate('premise(PLAYER_NOT_IN_EXHIBITIONISM_SEX_MODE)', premiseCtx())).toBe(true)
      getChar(PLAYER).sp_flag = { exhibitionism_sex_mode: 1 }
      expect(conditionEngine.evaluate('premise(PLAYER_NOT_IN_EXHIBITIONISM_SEX_MODE)', premiseCtx())).toBe(false)
    })
  })

  describe('露出经验（settle_behavior.py:670-672——每次行为结算，露出角色无条件 +1）', () => {
    it('玩家+目标都露出 → execution_end 双方 experience[34] +1', async () => {
      getChar(PLAYER).sp_flag = { exhibitionism_sex_mode: 1 }
      getChar(NPC).sp_flag = { exhibitionism_sex_mode: 1 }
      await tick(10)
      expect(getChar(PLAYER).experience['34']).toBe(1)
      expect(getChar(NPC).experience['34']).toBe(1)
    })

    it('非露出角色不加露出经验', async () => {
      getChar(NPC).sp_flag = { exhibitionism_sex_mode: 0 }
      await tick(10)
      expect(getChar(NPC).experience['34'] ?? 0).toBe(0)
    })

    it('hook 拦截（timeCost=0，时间未推进）→ 不加 tick/经验（erArk 无行为结算）', async () => {
      getChar(PLAYER).sp_flag = { exhibitionism_sex_mode: 1 }
      getChar(NPC).sp_flag = { exhibitionism_sex_mode: 1 }
      await tick(0)
      expect(getChar(PLAYER).experience['34'] ?? 0).toBe(0)
      expect(getChar(NPC).experience['34'] ?? 0).toBe(0)
      expect(getChar(PLAYER).base['羞耻']).toBe(0)
    })
  })

  describe('成就记录与判定（exhibitionism_sex_record + 931/932/933）', () => {
    async function setLevel(target: string): Promise<void> {
      await apiSystem.call('effect-system', 'execute',
        [{ type: 'exposure_set_level', params: {}, target: 'self' }],
        { sourceId: target, _targetIds: [target] })
    }

    it('exposure_set_level 初始化 rec[1]=模式、rec[2]=场景其他人数', async () => {
      const n = getChar(NPC)
      n.sp_flag = { exhibitionism_sex_mode: 0 }
      n.sp_flag.target_character_id = PLAYER
      getChar(PASSERBY).current_location = 'town_square'
      await setLevel(NPC)
      // 场景 3 人（player+npc+passerby）→ rec[2] = 3-2 = 1；mode 由 computeModeByScene 定（3，有人前旁观）
      expect(n.achievement.exhibitionism_sex_record[1]).toBe(3)
      expect(n.achievement.exhibitionism_sex_record[2]).toBe(1)
    })

    it('h:orgasm → rec[4]+1 挂玩家（露出发起方）；h:shoot → rec[3]+1', async () => {
      getChar(PLAYER).sp_flag = { exhibitionism_sex_mode: 1 }
      getChar(PLAYER).achievement = { exhibitionism_sex_record: { 1: 3, 2: 1 } }
      await eventBus.emit('h:orgasm', { character: PLAYER, partId: 4, level: 0, count: 1, extra: false })
      await eventBus.emit('h:shoot', { character: PLAYER })
      expect(getChar(PLAYER).achievement.exhibitionism_sex_record[4]).toBe(1)
      expect(getChar(PLAYER).achievement.exhibitionism_sex_record[3]).toBe(1)
    })

    it('checkAchievements：931 首次露出+射精≥1 / 932 模式3/4+他人+射精+绝顶 / 933 众目睽睽', async () => {
      // 931
      getChar(PLAYER).achievement = { exhibitionism_sex_record: { 1: 2, 2: 1, 3: 1 } }
      expect(await apiSystem.call('h-exposure', 'checkAchievements', PLAYER)).toEqual([931])
      // 932（模式 3 + 他人 1 + 射精 1 + 绝顶 1）
      getChar(PLAYER).achievement = { exhibitionism_sex_record: { 1: 3, 2: 1, 3: 1, 4: 1 } }
      expect(await apiSystem.call('h-exposure', 'checkAchievements', PLAYER)).toEqual([931, 932])
      // 933（他人 ≥10 + 射精 ≥3 + 绝顶 ≥3）
      getChar(PLAYER).achievement = { exhibitionism_sex_record: { 1: 2, 2: 10, 3: 3, 4: 3 } }
      expect(await apiSystem.call('h-exposure', 'checkAchievements', PLAYER)).toEqual([931, 933])
    })
  })

  describe('指令：邀请露出（5054）/ 结束露出（6007）', () => {
    it('邀请露出：双方进露出模式 + H 开始 + 露出经验（CVE 效果 + 行为结算双路径）', async () => {
      const p = getChar(PLAYER)
      p.sp_flag = { exhibitionism_sex_mode: 0 }
      await commandExecutor.execute('ask_exhibitionism_sex', makeTestExecCtx())
      const n = getChar(NPC)
      // 场景 3 人（player+npc+passerby 清醒）→ 双方模式 3（人前露出）
      expect(p.sp_flag.exhibitionism_sex_mode).toBe(3)
      expect(n.sp_flag.exhibitionism_sex_mode).toBe(3)
      // H 开始（462/464）
      expect(p.h_state.is_h).toBe(true)
      expect(n.h_state.is_h).toBe(true)
      // 经验：邀请 CVE 效果 +1 + execution_end 行为结算 +1 = 2（erArk 双路径同）
      expect(p.experience['34']).toBe(2)
      expect(n.experience['34']).toBe(2)
    })

    it('已在露出中（EXHIBITIONISM_SEX_MODE_0 不满足）→ 邀请露出被拦截，时间不推进', async () => {
      getChar(PLAYER).sp_flag = { exhibitionism_sex_mode: 2 }
      const timeBefore = { ...gameContext.getContext().time }
      await commandExecutor.execute('ask_exhibitionism_sex', makeTestExecCtx())
      expect(gameContext.getContext().time).toEqual(timeBefore)
      getChar(PLAYER).sp_flag = {}
    })

    it('结束露出：h_end_h → h:end → 双方露出模式清零 + H 状态清理', async () => {
      const p = getChar(PLAYER)
      p.sp_flag = { exhibitionism_sex_mode: 0 }
      await commandExecutor.execute('ask_exhibitionism_sex', makeTestExecCtx())
      expect(p.h_state.is_h).toBe(true)
      expect(p.sp_flag.exhibitionism_sex_mode).toBe(3)

      await commandExecutor.execute('exhibitionism_sex_end', makeTestExecCtx())
      expect(p.sp_flag.exhibitionism_sex_mode).toBe(0)
      expect(getChar(NPC).sp_flag.exhibitionism_sex_mode).toBe(0)
      expect(p.h_state).toBeUndefined()
      expect(getChar(NPC).h_state).toBeUndefined()
    })

    it('未在露出/未在 H → 结束露出被拦截，时间不推进', async () => {
      const timeBefore = { ...gameContext.getContext().time }
      await commandExecutor.execute('exhibitionism_sex_end', makeTestExecCtx())
      expect(gameContext.getContext().time).toEqual(timeBefore)
    })
  })

  describe('卫生检查（has_indoor 覆盖）', () => {
    it('模组无任何 has_indoor 地点 → warning', () => {
      const mod = modLoader.getMod()!
      const tavern = mod.locations.get('tavern') as any
      const saved = tavern.tags
      tavern.tags = saved.filter((t: string) => t !== 'has_indoor')
      errorReporter.clear()
      checkIndoorTagCoverage()
      const errs = errorReporter.getErrors()
      expect(errs.some((e: any) => e.source === 'h-exposure' && e.severity === 'warning' && e.message.includes('has_indoor'))).toBe(true)
      tavern.tags = saved
    })
  })
})
