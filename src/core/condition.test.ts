import { describe, it, expect } from 'vitest'
import { evaluateCondition } from './condition'
import type { GameContext } from './types'

const ctx: GameContext = {
  player: { base: { hp: 50, mp: 100 }, id: 'player' },
  location: { id: 'tavern', name: '酒馆', parent: null, type: 'building', tags: ['rest', 'has_drink'], exits: [] },
  time: { minute: 0, hour: 20, day: 1, month: 1, year: 1 },
  getEntity: (type: string, id: string) => {
    if (type === 'character' && id === 'npc1') {
      return { base: { hp: 80, attack: 15 }, id: 'npc1' }
    }
    return null
  }
}

describe('evaluateCondition', () => {
  it('should evaluate simple numeric comparison', () => {
    expect(evaluateCondition('player.hp < 100', ctx)).toBe(true)
    expect(evaluateCondition('player.hp > 100', ctx)).toBe(false)
    expect(evaluateCondition('player.hp >= 50', ctx)).toBe(true)
    expect(evaluateCondition('player.hp <= 49', ctx)).toBe(false)
  })

  it('should evaluate && combinations', () => {
    expect(evaluateCondition('player.hp < 100 && player.mp > 50', ctx)).toBe(true)
    expect(evaluateCondition('player.hp < 100 && player.mp < 50', ctx)).toBe(false)
  })

  it('should evaluate || combinations', () => {
    expect(evaluateCondition('player.hp < 10 || player.mp > 50', ctx)).toBe(true)
    expect(evaluateCondition('player.hp < 10 || player.mp < 50', ctx)).toBe(false)
  })

  it('should evaluate parentheses', () => {
    expect(evaluateCondition('(player.hp < 100 || player.mp < 0) && game.time.hour >= 18', ctx)).toBe(true)
  })

  it('should evaluate string equality', () => {
    expect(evaluateCondition('location.id == "tavern"', ctx)).toBe(true)
    expect(evaluateCondition('location.id != "town"', ctx)).toBe(true)
    expect(evaluateCondition('location.type == "building"', ctx)).toBe(true)
  })

  it('should evaluate array contains check', () => {
    expect(evaluateCondition('location.tags.rest == true', ctx)).toBe(true)
    expect(evaluateCondition('location.tags.has_drink == true', ctx)).toBe(true)
    expect(evaluateCondition('location.tags.nonexistent == true', ctx)).toBe(false)
  })

  it('should evaluate game.time fields', () => {
    expect(evaluateCondition('game.time.hour >= 18', ctx)).toBe(true)
    expect(evaluateCondition('game.time.hour < 18', ctx)).toBe(false)
    expect(evaluateCondition('game.time.day == 1', ctx)).toBe(true)
  })

  it('should evaluate character fields via getEntity', () => {
    expect(evaluateCondition('character.npc1.hp > 50', ctx)).toBe(true)
    expect(evaluateCondition('character.npc1.hp < 50', ctx)).toBe(false)
  })

  it('should evaluate ! negation', () => {
    expect(evaluateCondition('!(player.hp > 100)', ctx)).toBe(true)
    expect(evaluateCondition('!false', ctx)).toBe(true)
  })

  it('should return default values for missing fields (never throw)', () => {
    expect(evaluateCondition('player.nonexistent > 10', ctx)).toBe(false)
    expect(evaluateCondition('player.nonexistent == 0', ctx)).toBe(true)
    expect(evaluateCondition('character.nonexistent.hp > 10', ctx)).toBe(false)
  })

  it('should reject arithmetic in conditions', () => {
    expect(() => evaluateCondition('player.hp + 10 > 50', ctx)).toThrow()
    expect(() => evaluateCondition('player.hp - 10 > 50', ctx)).toThrow()
  })

  it('should handle complex nested expressions', () => {
    expect(evaluateCondition(
      '(player.hp < 100 && location.tags.rest == true) || game.time.hour >= 22',
      ctx
    )).toBe(true)
  })

  it('should not false-positive arithmetic check on string content with dashes', () => {
    expect(() => evaluateCondition('location.name == "酒馆-分店"', ctx)).not.toThrow()
  })

  it('should not hang on unbalanced parens in string literals', () => {
    expect(() => evaluateCondition('location.name == "酒馆(分店"', ctx)).not.toThrow()
  })
})
