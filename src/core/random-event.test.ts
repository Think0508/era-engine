import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { randomEventEngine, interpolateEventText, type EventTriggerContext } from './random-event'
import { premiseRegistry } from './premise-registry'
import { entitySystem } from './entity-system'
import type { RandomEventDef } from './mod-loader'

const defs: RandomEventDef[] = [
  { id: 'e1', behavior: 'move', type: 0, text: '普通事件', effects: [] },
  { id: 'e2', behavior: 'move', type: 0, adv: 'linghu', side: 'target', premises: ['HIGH_1'], text: '专属事件', effects: [] },
  { id: 'e3', behavior: 'move', type: 0, trigger_guard: 'unseen_once', text: '一次性事件', effects: [] },
  { id: 'e4', behavior: 'move', type: 0, option_son: true, premises: ['P1'], text: '选项A|子事件A', effects: [] },
  { id: 'e5', behavior: 'move', type: 0, option_son: true, premises: ['P1', 'P2'], text: '选项B|子事件B', effects: [] },
]

function ctx(over: Partial<EventTriggerContext> = {}): EventTriggerContext {
  return { subjectId: 'player', targetId: 'linghu', ...over }
}

beforeEach(() => {
  entitySystem.clear()
  entitySystem.register('character', 'player', { id: 'player', name: '玩家' } as any)
  entitySystem.register('character', 'linghu', { id: 'linghu', name: '令狐冲' } as any)
  premiseRegistry.clear()
  premiseRegistry.register('HIGH_1', () => 1)
  premiseRegistry.register('P1', () => 1)
  premiseRegistry.register('P2', () => 2)
  randomEventEngine.clear()
  randomEventEngine.registerAll(defs)
})

describe('randomEventEngine.pick', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('picks universal event by weight', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const e = randomEventEngine.pick('move', ctx())
    expect(e?.id).toBe('e1')
  })

  it('matches adv by side=target with targetId', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4)
    const e = randomEventEngine.pick('move', ctx({ targetId: 'linghu' }))
    expect(e?.id).toBe('e2')
  })

  it('does not pick adv event when target does not match', () => {
    randomEventEngine.clear()
    randomEventEngine.registerAll([{ id: 'e2', behavior: 'move', type: 0, adv: 'yue', side: 'target', text: 'x', effects: [] }])
    expect(randomEventEngine.pick('move', ctx())).toBeNull()
  })

  it('filters by trigger_guard unseen_once after record', () => {
    randomEventEngine.clear()
    randomEventEngine.registerAll([{ id: 'e3', behavior: 'move', type: 0, trigger_guard: 'unseen_once', text: 'x', effects: [] }])
    expect(randomEventEngine.pick('move', ctx())?.id).toBe('e3')
    randomEventEngine.recordTriggered('e3')
    expect(randomEventEngine.pick('move', ctx())).toBeNull()
  })

  it('zero weight eliminates candidate', () => {
    premiseRegistry.clear()
    premiseRegistry.register('HIGH_1', () => 0)
    premiseRegistry.register('P1', () => 1)
    premiseRegistry.register('P2', () => 2)
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const e = randomEventEngine.pick('move', ctx())
    expect(e?.id).toBe('e1')
  })

  it('condition false eliminates candidate', () => {
    randomEventEngine.clear()
    randomEventEngine.registerAll([{ id: 'c1', behavior: 'move', type: 0, condition: 'player.hp >= 999', text: 'x', effects: [] }])
    expect(randomEventEngine.pick('move', ctx())).toBeNull()
  })

  it('unknown behavior returns null', () => {
    expect(randomEventEngine.pick('sleep', ctx())).toBeNull()
  })
})

describe('randomEventEngine.getSonCandidates', () => {
  it('collects son events whose premises superset father premises', () => {
    const father: RandomEventDef = { id: 'father', behavior: 'move', type: 0, premises: ['P1'], text: '父|父文', effects: [] }
    const sons = randomEventEngine.getSonCandidates('move', father, ctx())
    expect(sons.map(s => s.id).sort()).toEqual(['e4', 'e5'])
  })

  it('son option text is first segment', () => {
    const father: RandomEventDef = { id: 'father', behavior: 'move', type: 0, premises: ['P1'], text: '父|父文', effects: [] }
    const sons = randomEventEngine.getSonCandidates('move', father, ctx())
    expect(sons[0].text?.split('|')[0]).toBe('选项A')
  })

  it('does not collect son whose premises miss father premise', () => {
    const father: RandomEventDef = { id: 'father', behavior: 'move', type: 0, premises: ['P1', 'P2'], text: '父|父文', effects: [] }
    const sons = randomEventEngine.getSonCandidates('move', father, ctx())
    expect(sons.map(s => s.id)).toEqual(['e5'])
  })
})

describe('trigger records', () => {
  it('serialize/restore roundtrip', () => {
    randomEventEngine.recordTriggered('e1')
    randomEventEngine.recordTodayTriggered('e2')
    const data = randomEventEngine.serialize()
    randomEventEngine.clear()
    randomEventEngine.restore(data)
    expect(randomEventEngine.isTriggered('e1')).toBe(true)
    expect(randomEventEngine.isTodayTriggered('e2')).toBe(true)
  })

  it('resetToday clears today only', () => {
    randomEventEngine.recordTriggered('e1')
    randomEventEngine.recordTodayTriggered('e2')
    randomEventEngine.resetToday()
    expect(randomEventEngine.isTriggered('e1')).toBe(true)
    expect(randomEventEngine.isTodayTriggered('e2')).toBe(false)
  })
})

describe('interpolateEventText', () => {
  it('replaces {self.X} {target.X} from entities', () => {
    const text = interpolateEventText('{self.name}对{target.name}说', 'player', 'linghu')
    expect(text).toBe('玩家对令狐冲说')
  })

  it('leaves unknown placeholder untouched', () => {
    const text = interpolateEventText('{self.name}和{unknown.x}', 'player', 'linghu')
    expect(text).toBe('玩家和{unknown.x}')
  })
})
