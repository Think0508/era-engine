// 注释：B4-B7 SEX/item（6401-6428 保留 19 条）复刻测试
// 覆盖：消耗类玩具/润滑液/按摩棒、避孕套、夹子/震动棒/拉珠装卸、遥控玩具档位。

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { modLoader } from '../core/mod-loader'
import { gameContext } from '../core/game-context'
import { entitySystem } from '../core/entity-system'
import { apiSystem } from '../core/api'
import { commandRegistry } from '../core/command-registry'
import { commandExecutor } from '../core/command-executor'
import { narrativeLog } from '../core/narrative-log'
import { errorReporter } from '../core/error-reporter'
import { eventBus } from '../core/event-bus'
import { clearBehaviorHistory } from '../core/command-executor'
import { makeTestExecCtx, resetCharacterEntity, DEFAULT_NPC_BASE, DEFAULT_PLAYER_BASE } from '../utils/test-helpers'
import { onLoad as effectOnLoad, onEnable as effectOnEnable } from './effect-system/index'
import { onLoad as hCoreOnLoad, onEnable as hCoreOnEnable } from './h-core/index'
import { onLoad as bondageOnLoad, onEnable as bondageOnEnable } from './h-bondage/index'
import { onLoad as sleepOnLoad, onEnable as sleepOnEnable } from './sleep-system/index'
import { onLoad as timeStopOnLoad, onEnable as timeStopOnEnable } from './h-time-stop/index'
import { onLoad as dialogueOnLoad, onEnable as dialogueOnEnable } from './dialogue-system/index'
import { onEnable as talkCommonOnEnable } from './talk-common-system/index'
import { onEnable as confinementOnEnable } from './confinement-system/index'
import { onLoad as exposureOnLoad, onEnable as exposureOnEnable } from './h-exposure/index'
import { onLoad as followOnLoad, onEnable as followOnEnable } from './follow-system/index'
import { onLoad as hiddenOnLoad, onEnable as hiddenOnEnable } from './h-hidden/index'
import { onLoad as groupSexOnLoad, onEnable as groupSexOnEnable } from './h-group-sex/index'
import { onLoad as hNpcAiOnLoad, onEnable as hNpcAiOnEnable } from './h-npc-ai/index'
import { onLoad as ejaculationOnLoad, onEnable as ejaculationOnEnable } from './h-ejaculation/index'
import { onLoad as firstTimeOnLoad } from './h-first-time/index'
import { onLoad as inventoryOnLoad, onEnable as inventoryOnEnable } from './inventory-system/index'

const stubCtx: any = {
  api: apiSystem,
  events: eventBus,
  commands: commandRegistry,
  ui: { registerSlot: () => {} },
}

const execCtx = makeTestExecCtx

function npc(): any {
  return entitySystem.get('character', 'npc_1') as any
}

function player(): any {
  return entitySystem.get('character', 'player') as any
}

function setInventory(items: [string, number][]): void {
  player().inventory = items.map(([itemId, count]) => ({ itemId, count }))
}

function resetChars(): void {
  resetCharacterEntity(player(), DEFAULT_PLAYER_BASE)
  resetCharacterEntity(npc(), DEFAULT_NPC_BASE)
  player().first_times = {}
  npc().first_times = {}
  player().h_state = { is_h: true, target_character_id: 'npc_1', current_sex_position: -1 }
  npc().h_state = { is_h: true, target_character_id: 'player', insert_position: -1, sex_toy_level: 0 }
  player().inventory = []
  npc().inventory = []
  player().base['体力'] = 100
  player().base['气力'] = 300
  player().base['气力上限'] = 300
  npc().base['体力'] = 100
  npc().base['气力'] = 300
  npc().base['气力上限'] = 300
}

const ITEM_IDS = [
  'body_lubricant', 'put_condom', 'take_condom_out',
  'nipples_love_egg', 'nipple_clamp_on', 'nipple_clamp_off',
  'clit_love_egg', 'clit_clamp_on', 'clit_clamp_off',
  'electric_message_stick', 'vibrator_insertion', 'vibrator_insertion_off',
  'vibrator_insertion_anal', 'vibrator_insertion_anal_off',
  'anal_beads', 'anal_beads_off', 'remote_toy_on_in_h', 'remote_toy_off_in_h', 'remote_toy_level_up_in_h',
]

describe('B4-B7 SEX/item（6401-6428 保留 19 条）', () => {
  beforeAll(async () => {
    entitySystem.clear()
    commandRegistry.clear()
    errorReporter.clear()
    narrativeLog.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    gameContext.setPlayer('player')
    const firstLoc = mod.locations.values().next().value as any
    firstLoc.furniture_count = 3
    gameContext.setLocation(firstLoc)

    effectOnLoad(stubCtx)
    effectOnEnable(stubCtx)
    inventoryOnLoad(stubCtx)
    inventoryOnEnable(stubCtx)
    hCoreOnLoad(stubCtx)
    hCoreOnEnable(stubCtx)
    bondageOnLoad(stubCtx)
    await bondageOnEnable(stubCtx)
    sleepOnLoad(stubCtx)
    await sleepOnEnable(stubCtx)
    timeStopOnLoad(stubCtx)
    await timeStopOnEnable(stubCtx)
    dialogueOnLoad(stubCtx)
    dialogueOnEnable(stubCtx)
    await talkCommonOnEnable(stubCtx)
    await confinementOnEnable(stubCtx)
    exposureOnLoad(stubCtx)
    await exposureOnEnable(stubCtx)
    followOnLoad(stubCtx)
    await followOnEnable(stubCtx)
    hiddenOnLoad(stubCtx)
    await hiddenOnEnable(stubCtx)
    groupSexOnLoad(stubCtx)
    await groupSexOnEnable(stubCtx)
    hNpcAiOnLoad(stubCtx)
    await hNpcAiOnEnable(stubCtx)
    ejaculationOnLoad(stubCtx)
    await ejaculationOnEnable(stubCtx)
    firstTimeOnLoad(stubCtx)

    const p = entitySystem.get('character', 'player') as any
    p.current_location = 'town_square'
    entitySystem.register('character', 'npc_1', {
      id: 'npc_1', name: '测试NPC',
      base: {},
      current_location: 'town_square',
    })
    gameContext.setSelectedCharacterId('npc_1')
    resetChars()
  })

  beforeEach(() => {
    clearBehaviorHistory()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('item 19 条指令已注册', () => {
    for (const id of ITEM_IDS) {
      expect(commandRegistry.getById(id), id).toBeDefined()
    }
  })

  it('消耗类：body_lubricant / nipples_love_egg / clit_love_egg / electric_message_stick', async () => {
    const cases: [string, [string, number][], string][] = [
      ['body_lubricant', [['润滑液', 1]], '润滑'],
      ['nipples_love_egg', [['跳蛋', 1]], '胸部'],
      ['clit_love_egg', [['跳蛋', 1]], '阴蒂'],
      ['electric_message_stick', [['电动按摩棒', 1]], '阴蒂'],
    ]
    for (const [id, inv, part] of cases) {
      resetChars()
      setInventory(inv)
      await commandExecutor.execute(id, execCtx())
      expect((player().inventory.find((i: any) => i.itemId === inv[0][0])?.count ?? 0)).toBe(0)
      expect(npc().base['体力']).toBe(70)
      expect(npc().base['气力']).toBe(240)
      expect(npc().base['好感度']).toBe(10)
      expect(npc().base['反感']).toBe(15)
      if (part === '润滑') expect(npc().base['润滑']).toBeGreaterThan(100) // apply_lubricant huge
      else expect(npc().base[part]).toBeGreaterThan(0)
      expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
    }
  })

  it('put_condom / take_condom_out：避孕套装卸', async () => {
    resetChars()
    setInventory([['避孕套', 1]])
    await commandExecutor.execute('put_condom', execCtx())
    expect(player().h_state.condom).toBe(true)
    expect((player().inventory.find((i: any) => i.itemId === '避孕套')?.count ?? 0)).toBe(0)

    resetChars()
    player().h_state.condom = true
    await commandExecutor.execute('take_condom_out', execCtx())
    expect(player().h_state.condom).toBe(false)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('nipple_clamp_on/off：装卸乳头夹 + 档位（装备不消耗）', async () => {
    resetChars()
    setInventory([['乳头夹', 1]]) // 装备类玩具不消耗，取下无需备件
    npc().h_state.nipple_clamp = false
    await commandExecutor.execute('nipple_clamp_on', execCtx())
    expect(npc().h_state.nipple_clamp).toBe(true)
    expect(npc().h_state.sex_toy_level).toBe(1)
    expect(npc().body_items['0'].itemId).toBe('乳头夹')
    expect((player().inventory.find((i: any) => i.itemId === '乳头夹')?.count ?? 0)).toBe(1)

    await commandExecutor.execute('nipple_clamp_off', execCtx())
    expect(npc().h_state.nipple_clamp).toBe(false)
    expect(npc().body_items?.['0']).toBeUndefined()
    expect((player().inventory.find((i: any) => i.itemId === '乳头夹')?.count ?? 0)).toBe(1)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('clit_clamp_on/off：装卸阴蒂夹（装备不消耗）', async () => {
    resetChars()
    setInventory([['阴蒂夹', 1]])
    await commandExecutor.execute('clit_clamp_on', execCtx())
    expect(npc().h_state.clit_clamp).toBe(true)
    expect(npc().h_state.sex_toy_level).toBe(1)
    expect(npc().body_items['1'].itemId).toBe('阴蒂夹')
    expect((player().inventory.find((i: any) => i.itemId === '阴蒂夹')?.count ?? 0)).toBe(1)

    await commandExecutor.execute('clit_clamp_off', execCtx())
    expect(npc().h_state.clit_clamp).toBe(false)
    expect(npc().body_items?.['1']).toBeUndefined()
    expect((player().inventory.find((i: any) => i.itemId === '阴蒂夹')?.count ?? 0)).toBe(1)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('vibrator_insertion / off：V 震动棒装卸（装备不消耗）', async () => {
    resetChars()
    setInventory([['V震动棒', 1]])
    npc().h_state.insert_position = -1
    await commandExecutor.execute('vibrator_insertion', execCtx())
    expect(npc().h_state.vibrator_insertion).toBe(true)
    expect(npc().h_state.sex_toy_level).toBe(1)
    expect(npc().body_items['2'].itemId).toBe('V震动棒')
    expect((player().inventory.find((i: any) => i.itemId === 'V震动棒')?.count ?? 0)).toBe(1)

    await commandExecutor.execute('vibrator_insertion_off', execCtx())
    expect(npc().h_state.vibrator_insertion).toBe(false)
    expect(npc().h_state.sex_toy_level).toBe(0)
    expect(npc().body_items?.['2']).toBeUndefined()
    expect((player().inventory.find((i: any) => i.itemId === 'V震动棒')?.count ?? 0)).toBe(1)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('vibrator_insertion_anal / off：A 震动棒装卸（装备不消耗）', async () => {
    resetChars()
    setInventory([['A震动棒', 1]])
    await commandExecutor.execute('vibrator_insertion_anal', execCtx())
    expect(npc().h_state.vibrator_insertion_anal).toBe(true)
    expect(npc().h_state.sex_toy_level).toBe(1)
    expect(npc().body_items['3'].itemId).toBe('A震动棒')
    expect((player().inventory.find((i: any) => i.itemId === 'A震动棒')?.count ?? 0)).toBe(1)

    await commandExecutor.execute('vibrator_insertion_anal_off', execCtx())
    expect(npc().h_state.vibrator_insertion_anal).toBe(false)
    expect(npc().h_state.sex_toy_level).toBe(0)
    expect(npc().body_items?.['3']).toBeUndefined()
    expect((player().inventory.find((i: any) => i.itemId === 'A震动棒')?.count ?? 0)).toBe(1)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('anal_beads / off：肛门拉珠装卸（装备不消耗）', async () => {
    resetChars()
    setInventory([['肛门拉珠', 1]])
    await commandExecutor.execute('anal_beads', execCtx())
    expect(npc().h_state.anal_beads).toBe(true)
    expect(npc().body_items['7'].itemId).toBe('肛门拉珠')
    expect((player().inventory.find((i: any) => i.itemId === '肛门拉珠')?.count ?? 0)).toBe(1)

    await commandExecutor.execute('anal_beads_off', execCtx())
    expect(npc().h_state.anal_beads).toBe(false)
    expect(npc().body_items?.['7']).toBeUndefined()
    expect((player().inventory.find((i: any) => i.itemId === '肛门拉珠')?.count ?? 0)).toBe(1)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('remote_toy_on/off/level_up：遥控玩具档位', async () => {
    resetChars()
    npc().h_state.sex_toy_level = 0
    npc().h_state.vibrator_insertion = true // 有玩具
    await commandExecutor.execute('remote_toy_on_in_h', execCtx())
    expect(npc().h_state.sex_toy_level).toBe(1)

    await commandExecutor.execute('remote_toy_level_up_in_h', execCtx())
    expect(npc().h_state.sex_toy_level).toBe(3)

    await commandExecutor.execute('remote_toy_off_in_h', execCtx())
    expect(npc().h_state.sex_toy_level).toBe(0)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('口上默认文件存在且无世界观残留', async () => {
    for (const scene of ITEM_IDS) {
      const text = await apiSystem.call('talk-common', 'getText', scene, 'npc_1', 'player') as string | null
      expect(text, scene).toBeTruthy()
      expect(text, scene).not.toContain('博士')
      expect(text, scene).not.toContain('源石')
    }
  })
})