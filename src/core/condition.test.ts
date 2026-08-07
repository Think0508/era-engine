import { describe, it, expect } from 'vitest'
import { evaluateCondition } from './condition'
import type { GameContext } from './types'

const ctx: GameContext = {
  player: { base: { hp: 50, mp: 100 }, id: 'player' },
  location: { id: 'tavern', name: '酒馆', parent: null, type: 'building', tags: ['rest', 'has_drink'] },
  time: { minute: 0, hour: 20, day: 1, month: 1, year: 1 },
  selectedCharacterId: 'npc1',
  fieldAliases: { status: 'status_effects', remaining: 'remaining_duration' },
  getEntity: (type: string, id: string) => {
    if (type === 'character' && id === 'npc1') {
      return {
        base: { hp: 80, attack: 15 },
        id: 'npc1',
        body_semen: { '0': [0, 5, 1, 10], '6': [0, 3, 1, 5] },
        talents: { '幼女': 1, '贫乳': 1 },
        abilities: { '舌技': { level: 3, xp: 0 } },
        status_effects: [
          { id: '醉意', remaining_duration: 120, stack: 2, last_tick_game_time: 1 },
        ],
      }
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

  it('should evaluate selected character fields', () => {
    expect(evaluateCondition('selected.base.hp > 50', ctx)).toBe(true)
    expect(evaluateCondition('selected.base.hp > 100', ctx)).toBe(false)
  })

  it('should evaluate selected talents (L2.12 style)', () => {
    expect(evaluateCondition('selected.talents.幼女 == 1', ctx)).toBe(true)
    expect(evaluateCondition('selected.talents.贫乳 == 1', ctx)).toBe(true)
    expect(evaluateCondition('selected.talents.巨乳 == 1', ctx)).toBe(false)
  })

  it('should evaluate selected abilities', () => {
    expect(evaluateCondition('selected.abilities.舌技.level > 2', ctx)).toBe(true)
    expect(evaluateCondition('selected.abilities.舌技.level > 5', ctx)).toBe(false)
  })

  it('should evaluate selected body_semen numeric array access', () => {
    // body_semen.0.1 = current ml of body part 0 (hair) = 5
    expect(evaluateCondition('selected.body_semen.0.1 > 1', ctx)).toBe(true)
    expect(evaluateCondition('selected.body_semen.0.1 == 5', ctx)).toBe(true)
    // body_semen.6.1 = current ml of body part 6 (vagina) = 3
    expect(evaluateCondition('selected.body_semen.6.1 > 2', ctx)).toBe(true)
    expect(evaluateCondition('selected.body_semen.6.1 > 5', ctx)).toBe(false)
  })

  it('should return default values for selected without selectedCharacterId', () => {
    const ctxNoSelected = { ...ctx, selectedCharacterId: undefined }
    expect(evaluateCondition('selected.base.hp > 10', ctxNoSelected)).toBe(false)
  })

  it('target 根路径与 selected 同解（judge adjustments 用）', () => {
    expect(evaluateCondition('target.base.hp > 50', ctx)).toBe(true)
    expect(evaluateCondition('target.first_times.virgin_KISS != true', ctx)).toBe(true)
    expect(evaluateCondition('target.talents.巨乳 == 1', ctx)).toBe(false)
    const ctxNoTarget = { ...ctx, selectedCharacterId: undefined }
    expect(evaluateCondition('target.base.hp > 10', ctxNoTarget)).toBe(false)
  })

  it('null/undefined 右值——存在性检查（selected != null 惯用法）', () => {
    // 有选中 → selected 解析到实体 → != null 为 true
    expect(evaluateCondition('selected != null', ctx)).toBe(true)
    expect(evaluateCondition('selected == null', ctx)).toBe(false)
    // 无选中 → undefined → != null 为 false（talk/open_selected_panel 依赖此语义）
    const ctxNoSel = { ...ctx, selectedCharacterId: undefined }
    expect(evaluateCondition('selected != null', ctxNoSel)).toBe(false)
    expect(evaluateCondition('selected == null', ctxNoSel)).toBe(true)
  })

  it('能力记录终端解包为等级（AGENTS §36 数据契约）', () => {
    expect(evaluateCondition('selected.abilities.舌技 >= 3', ctx)).toBe(true)
    expect(evaluateCondition('selected.abilities.舌技 >= 4', ctx)).toBe(false)
    expect(evaluateCondition('selected.abilities.舌技.level >= 3', ctx)).toBe(true)
  })

  it('status 别名路径（fieldAliases：status→status_effects, remaining→remaining_duration）', () => {
    // 存在性：对象数组按 id 匹配 + 终端条目解包 true
    expect(evaluateCondition('selected.status.醉意 == true', ctx)).toBe(true)
    expect(evaluateCondition('selected.status.中毒 == true', ctx)).toBe(false)
    // stack / remaining（别名 → remaining_duration）
    expect(evaluateCondition('selected.status.醉意.stack == 2', ctx)).toBe(true)
    expect(evaluateCondition('selected.status.醉意.remaining >= 60', ctx)).toBe(true)
    expect(evaluateCondition('selected.status.醉意.remaining < 60', ctx)).toBe(false)
    // 无别名时不误解析（fieldAliases 缺失 → 未知字段默认 0）
    const ctxNoAlias = { ...ctx, fieldAliases: undefined }
    expect(evaluateCondition('selected.status.醉意 == true', ctxNoAlias)).toBe(false)
  })
})
