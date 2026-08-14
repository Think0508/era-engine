import { describe, it, expect, beforeEach } from 'vitest'
import { conditionEngine } from './condition-engine'
import type { GameContext } from './types'

const ctx: GameContext = {
  player: { base: { hp: 50, mp: 100 }, id: 'player' },
  location: { id: 'tavern', name: '酒馆', parent: null, type: 'building', tags: ['rest', 'has_drink'] },
  time: { minute: 0, hour: 20, day: 1, month: 1, year: 1 },
  mode: 'exploration',
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
    if (type === 'character' && id === 'npc2') {
      return {
        base: { hp: 30 },
        id: 'npc2',
      }
    }
    return null
  },
}

describe('conditionEngine.evaluate', () => {
  it('should evaluate simple numeric comparison', () => {
    expect(conditionEngine.evaluate('player.hp < 100', ctx)).toBe(true)
    expect(conditionEngine.evaluate('player.hp > 100', ctx)).toBe(false)
    expect(conditionEngine.evaluate('player.hp >= 50', ctx)).toBe(true)
    expect(conditionEngine.evaluate('player.hp <= 49', ctx)).toBe(false)
  })

  it('should evaluate && combinations', () => {
    expect(conditionEngine.evaluate('player.hp < 100 && player.mp > 50', ctx)).toBe(true)
    expect(conditionEngine.evaluate('player.hp < 100 && player.mp < 50', ctx)).toBe(false)
  })

  it('should evaluate || combinations', () => {
    expect(conditionEngine.evaluate('player.hp < 10 || player.mp > 50', ctx)).toBe(true)
    expect(conditionEngine.evaluate('player.hp < 10 || player.mp < 50', ctx)).toBe(false)
  })

  it('should evaluate parentheses', () => {
    expect(conditionEngine.evaluate('(player.hp < 100 || player.mp < 0) && game.time.hour >= 18', ctx)).toBe(true)
  })

  it('should evaluate string equality', () => {
    expect(conditionEngine.evaluate('location.id == "tavern"', ctx)).toBe(true)
    expect(conditionEngine.evaluate('location.id != "town"', ctx)).toBe(true)
    expect(conditionEngine.evaluate('location.type == "building"', ctx)).toBe(true)
    expect(conditionEngine.evaluate("location.id == 'tavern'", ctx)).toBe(true)
  })

  it('should evaluate array contains check', () => {
    expect(conditionEngine.evaluate('location.tags.rest == true', ctx)).toBe(true)
    expect(conditionEngine.evaluate('location.tags.has_drink == true', ctx)).toBe(true)
    expect(conditionEngine.evaluate('location.tags.nonexistent == true', ctx)).toBe(false)
  })

  it('should evaluate game.time fields', () => {
    expect(conditionEngine.evaluate('game.time.hour >= 18', ctx)).toBe(true)
    expect(conditionEngine.evaluate('game.time.hour < 18', ctx)).toBe(false)
    expect(conditionEngine.evaluate('game.time.day == 1', ctx)).toBe(true)
  })

  it('should evaluate character fields via getEntity', () => {
    expect(conditionEngine.evaluate('character.npc1.hp > 50', ctx)).toBe(true)
    expect(conditionEngine.evaluate('character.npc1.hp < 50', ctx)).toBe(false)
  })

  it('should evaluate ! negation', () => {
    expect(conditionEngine.evaluate('!(player.hp > 100)', ctx)).toBe(true)
    expect(conditionEngine.evaluate('!false', ctx)).toBe(true)
  })

  it('should return default values for missing fields (never throw)', () => {
    expect(conditionEngine.evaluate('player.nonexistent > 10', ctx)).toBe(false)
    expect(conditionEngine.evaluate('player.nonexistent == 0', ctx)).toBe(true)
    expect(conditionEngine.evaluate('character.nonexistent.hp > 10', ctx)).toBe(false)
  })

  it('should reject arithmetic in conditions', () => {
    expect(() => conditionEngine.evaluate('player.hp + 10 > 50', ctx)).toThrow()
    expect(() => conditionEngine.evaluate('player.hp - 10 > 50', ctx)).toThrow()
    expect(() => conditionEngine.evaluate('player.hp * 2 > 50', ctx)).toThrow()
    expect(() => conditionEngine.evaluate('player.hp / 2 > 50', ctx)).toThrow()
  })

  it('should handle complex nested expressions', () => {
    expect(conditionEngine.evaluate(
      '(player.hp < 100 && location.tags.rest == true) || game.time.hour >= 22',
      ctx
    )).toBe(true)
  })

  it('should not false-positive arithmetic check on string content with dashes', () => {
    expect(() => conditionEngine.evaluate('location.name == "酒馆-分店"', ctx)).not.toThrow()
  })

  it('should not hang on unbalanced parens in string literals', () => {
    expect(() => conditionEngine.evaluate('location.name == "酒馆(分店"', ctx)).not.toThrow()
  })

  it('should evaluate selected character fields', () => {
    expect(conditionEngine.evaluate('selected.base.hp > 50', ctx)).toBe(true)
    expect(conditionEngine.evaluate('selected.base.hp > 100', ctx)).toBe(false)
  })

  it('should evaluate selected talents (L2.12 style)', () => {
    expect(conditionEngine.evaluate('selected.talents.幼女 == 1', ctx)).toBe(true)
    expect(conditionEngine.evaluate('selected.talents.贫乳 == 1', ctx)).toBe(true)
    expect(conditionEngine.evaluate('selected.talents.巨乳 == 1', ctx)).toBe(false)
  })

  it('should evaluate selected abilities', () => {
    expect(conditionEngine.evaluate('selected.abilities.舌技.level > 2', ctx)).toBe(true)
    expect(conditionEngine.evaluate('selected.abilities.舌技.level > 5', ctx)).toBe(false)
  })

  it('should evaluate selected body_semen numeric array access', () => {
    expect(conditionEngine.evaluate('selected.body_semen.0.1 > 1', ctx)).toBe(true)
    expect(conditionEngine.evaluate('selected.body_semen.0.1 == 5', ctx)).toBe(true)
    expect(conditionEngine.evaluate('selected.body_semen.6.1 > 2', ctx)).toBe(true)
    expect(conditionEngine.evaluate('selected.body_semen.6.1 > 5', ctx)).toBe(false)
  })

  it('should return default values for selected without selectedCharacterId', () => {
    const ctxNoSelected = { ...ctx, selectedCharacterId: undefined }
    expect(conditionEngine.evaluate('selected.base.hp > 10', ctxNoSelected)).toBe(false)
  })

  it('target 根路径与 selected 同解（judge adjustments 用）', () => {
    expect(conditionEngine.evaluate('target.base.hp > 50', ctx)).toBe(true)
    expect(conditionEngine.evaluate('target.first_times.virgin_KISS != true', ctx)).toBe(true)
    expect(conditionEngine.evaluate('target.talents.巨乳 == 1', ctx)).toBe(false)
    const ctxNoTarget = { ...ctx, selectedCharacterId: undefined }
    expect(conditionEngine.evaluate('target.base.hp > 10', ctxNoTarget)).toBe(false)
  })

  it('null/undefined 右值——存在性检查（selected != null 惯用法）', () => {
    expect(conditionEngine.evaluate('selected != null', ctx)).toBe(true)
    expect(conditionEngine.evaluate('selected == null', ctx)).toBe(false)
    const ctxNoSel = { ...ctx, selectedCharacterId: undefined }
    expect(conditionEngine.evaluate('selected != null', ctxNoSel)).toBe(false)
    expect(conditionEngine.evaluate('selected == null', ctxNoSel)).toBe(true)
  })

  it('能力记录终端解包为等级（AGENTS §36 数据契约）', () => {
    expect(conditionEngine.evaluate('selected.abilities.舌技 >= 3', ctx)).toBe(true)
    expect(conditionEngine.evaluate('selected.abilities.舌技 >= 4', ctx)).toBe(false)
    expect(conditionEngine.evaluate('selected.abilities.舌技.level >= 3', ctx)).toBe(true)
  })

  it('status 别名路径（fieldAliases：status→status_effects, remaining→remaining_duration）', () => {
    expect(conditionEngine.evaluate('selected.status.醉意 == true', ctx)).toBe(true)
    expect(conditionEngine.evaluate('selected.status.中毒 == true', ctx)).toBe(false)
    expect(conditionEngine.evaluate('selected.status.醉意.stack == 2', ctx)).toBe(true)
    expect(conditionEngine.evaluate('selected.status.醉意.remaining >= 60', ctx)).toBe(true)
    expect(conditionEngine.evaluate('selected.status.醉意.remaining < 60', ctx)).toBe(false)
    const ctxNoAlias = { ...ctx, fieldAliases: undefined }
    expect(conditionEngine.evaluate('selected.status.醉意 == true', ctxNoAlias)).toBe(false)
  })

  it('game.mode 根路径（B1：战斗模式门控）', () => {
    expect(conditionEngine.evaluate('game.mode == "exploration"', ctx)).toBe(true)
    expect(conditionEngine.evaluate('game.mode == "combat"', ctx)).toBe(false)
    const combatCtx = { ...ctx, mode: 'combat' }
    expect(conditionEngine.evaluate('game.mode == "combat"', combatCtx)).toBe(true)
    expect(conditionEngine.evaluate('game.mode == "exploration"', combatCtx)).toBe(false)
    expect(conditionEngine.evaluate('game.mode != "combat"', combatCtx)).toBe(false)
  })

  it('B2：status 容器缺失——character.x.status.中毒 == false 为 true（undefined 存在性语义）', () => {
    expect(conditionEngine.evaluate('character.npc2.status.中毒 == false', ctx)).toBe(true)
    expect(conditionEngine.evaluate('character.npc2.status.中毒 == true', ctx)).toBe(false)
    expect(conditionEngine.evaluate('character.npc1.status.中毒 == false', ctx)).toBe(true)
    expect(conditionEngine.evaluate('character.npc1.status.醉意 == false', ctx)).toBe(false)
    expect(conditionEngine.evaluate('character.npc1.status.醉意 == true', ctx)).toBe(true)
    expect(conditionEngine.evaluate('character.npc2.status.中毒 != true', ctx)).toBe(true)
  })

  it('B2：裸 ! 求反——!character.npc2.status.中毒 不抛且为 true', () => {
    expect(conditionEngine.evaluate('!character.npc2.status.中毒', ctx)).toBe(true)
    expect(conditionEngine.evaluate('!character.npc1.status.中毒', ctx)).toBe(true)
    expect(conditionEngine.evaluate('!character.npc1.status.醉意', ctx)).toBe(false)
    expect(conditionEngine.evaluate('!player.hp', ctx)).toBe(false)
    expect(conditionEngine.evaluate('!player.不存在的属性', ctx)).toBe(true)
  })

  it('左值字面量——(true && true) == true 场景不把 true 当字段路径', () => {
    expect(conditionEngine.evaluate('(player.hp < 100 && player.mp > 50) == true', ctx)).toBe(true)
    expect(conditionEngine.evaluate('(player.hp < 10 && player.mp > 50) == true', ctx)).toBe(false)
  })

  it('关系聚合路径——any(...)/any_positive(...)/any_negative(...) 括号参数', () => {
    const aggCtx: GameContext = {
      ...ctx,
      relationGroups: { 血亲: ['父亲', '母亲'] },
      getEntity: (type: string, id: string) => {
        if (type === 'character' && id === 'npc1') {
          return {
            id: 'npc1',
            relations: {
              player: { 父亲: 1, 好感度: 60 },
              other: { 仇人: -1 },
            },
          }
        }
        return null
      },
    }
    expect(conditionEngine.evaluate('character.npc1.relations.player.any(父亲,母亲) == true', aggCtx)).toBe(true)
    expect(conditionEngine.evaluate('character.npc1.relations.player.any(group:血亲) == true', aggCtx)).toBe(true)
    expect(conditionEngine.evaluate('character.npc1.relations.player.any_positive(仇人) == true', aggCtx)).toBe(false)
    expect(conditionEngine.evaluate('character.npc1.relations.other.any_negative(仇人) == true', aggCtx)).toBe(true)
    expect(conditionEngine.evaluate('character.npc1.relations.other.any_negative(group:血亲) == true', aggCtx)).toBe(false)
    expect(conditionEngine.evaluate('character.npc1.relations.player.any() == true', aggCtx)).toBe(true)
  })

  it('关系聚合路径——无括号 any 段（无同名类型时聚合语义）', () => {
    const aggCtx: GameContext = {
      ...ctx,
      getEntity: (type: string, id: string) => {
        if (type === 'character' && id === 'npc1') {
          return { id: 'npc1', relations: { player: { 好感度: 60, 仇人: -1, 夫妻: 1 } } }
        }
        return null
      },
    }
    expect(conditionEngine.evaluate('character.npc1.relations.player.any == true', aggCtx)).toBe(true)
    expect(conditionEngine.evaluate('character.npc1.relations.player.any_positive == true', aggCtx)).toBe(true)
    expect(conditionEngine.evaluate('character.npc1.relations.player.any_negative == true', aggCtx)).toBe(true)
  })

  it('旧 premises: 前缀语法已删除——直接抛错', () => {
    expect(() => conditionEngine.evaluate('premises:high_1', ctx)).toThrow()
    expect(() => conditionEngine.evaluate('premises:high_1&sys_0', ctx)).toThrow()
  })

  it('非根形态裸路径抛错；非根形态比较走默认值不抛', () => {
    expect(() => conditionEngine.evaluate('foo.bar', ctx)).toThrow()
    expect(() => conditionEngine.evaluate('foo', ctx)).toThrow()
    expect(conditionEngine.evaluate('foo.bar == 1', ctx)).toBe(false)
    expect(conditionEngine.evaluate('foo == "x"', ctx)).toBe(false)
  })

  it('残缺表达式——友好报错而非裸 TypeError（M-1）', () => {
    // 注释（M-1）："a ==" 在比较右值处 token 耗尽 → parseOperand 读 undefined token——
    // 原实现 switch (tok.type) 抛裸 TypeError「Cannot read properties of undefined」；
    // 修复后抛可读的 "Condition expression is invalid" 错误
    expect(() => conditionEngine.evaluate('a ==', ctx)).toThrow(/Condition expression is invalid/)
    expect(() => conditionEngine.evaluate('player.气血 >=', ctx)).toThrow(/Condition expression is invalid/)
    expect(() => conditionEngine.evaluate('a !=', ctx)).toThrow(/Condition expression is invalid/)
    expect(() => conditionEngine.evaluate('', ctx)).toThrow(/Condition expression is invalid/)
  })

  it('clear 后求值仍正确（幂等）', () => {
    conditionEngine.clear()
    expect(conditionEngine.evaluate('player.hp < 100', ctx)).toBe(true)
    conditionEngine.clear()
  })

  it('字符串右值不支持大小比较——抛错', () => {
    expect(() => conditionEngine.evaluate('location.id > "tavern"', ctx)).toThrow()
  })

  it('inventory 根路径——背包数组按 itemId 匹配', () => {
    const invCtx: GameContext = {
      ...ctx,
      player: {
        id: 'player',
        inventory: [
          { itemId: '回气丹', count: 3 },
          { itemId: '酒', count: 1 },
        ],
      },
    }
    expect(conditionEngine.evaluate('inventory.回气丹.count >= 2', invCtx)).toBe(true)
    expect(conditionEngine.evaluate('inventory.回气丹.count >= 5', invCtx)).toBe(false)
    expect(conditionEngine.evaluate('inventory.不存在.count == 0', invCtx)).toBe(true)
  })
})

describe('conditionEngine 前提注册表', () => {
  beforeEach(() => { conditionEngine.clear() })

  it('premise(X) 命名引用——注册后求值、大小写不敏感、后注册覆盖', () => {
    conditionEngine.registerPremise('NOT_H', () => true)
    expect(conditionEngine.evaluate('premise(NOT_H) && player.hp < 100', ctx)).toBe(true)
    conditionEngine.registerPremise('not_h', () => false)
    expect(conditionEngine.evaluate('premise(NOT_H) == true', ctx)).toBe(false)
  })

  it('未知前提求值抛错（严格——校验层拦截漏网）', () => {
    expect(() => conditionEngine.evaluate('premise(UNKNOWN) == true', ctx)).toThrow()
    expect(() => conditionEngine.evaluate('premise(UNKNOWN)', ctx)).toThrow()
  })

  it('premise(X) 参与比较与逻辑组合', () => {
    conditionEngine.registerPremise('HAVE_TARGET', () => true)
    conditionEngine.registerPremise('IS_H', () => false)
    expect(conditionEngine.evaluate('premise(HAVE_TARGET) && !premise(IS_H)', ctx)).toBe(true)
    expect(conditionEngine.evaluate('premise(IS_H) == true', ctx)).toBe(false)
  })

  it('number 返回前提——truthy 判定（>0 通过）', () => {
    conditionEngine.registerPremise('N', () => 2)
    conditionEngine.registerPremise('ZERO', () => 0)
    expect(conditionEngine.evaluate('premise(N) >= 1', ctx)).toBe(true)
    expect(conditionEngine.evaluate('premise(N)', ctx)).toBe(true)
    expect(conditionEngine.evaluate('premise(ZERO) == true', ctx)).toBe(false)
    expect(conditionEngine.evaluate('premise(ZERO)', ctx)).toBe(false)
  })

  it('premise handler 收到完整 GameContext（含 sourceId）', () => {
    let seen: any = null
    conditionEngine.registerPremise('SELF', (c: GameContext) => { seen = c; return c.sourceId === 'npc1' })
    const withSource = { ...ctx, sourceId: 'npc1' }
    expect(conditionEngine.evaluate('premise(SELF)', withSource)).toBe(true)
    expect(seen?.time?.hour).toBe(20)
    expect(seen?.selectedCharacterId).toBe('npc1')
  })

  it('evaluatePremises——数组简写（全部 truthy；空数组 true）', () => {
    conditionEngine.registerPremise('A', () => true)
    conditionEngine.registerPremise('B', () => 1)
    conditionEngine.registerPremise('C', () => 0)
    expect(conditionEngine.evaluatePremises(['A', 'B'], ctx)).toBe(true)
    expect(conditionEngine.evaluatePremises(['A', 'C'], ctx)).toBe(false)
    expect(conditionEngine.evaluatePremises([], ctx)).toBe(true)
    expect(() => conditionEngine.evaluatePremises(['UNKNOWN'], ctx)).toThrow()
  })

  it('getPremiseValue——原始返回值（权重场景）', () => {
    conditionEngine.registerPremise('HIGH_5', () => 5)
    conditionEngine.registerPremise('BOOL_P', () => true)
    expect(conditionEngine.getPremiseValue('HIGH_5', ctx)).toBe(5)
    expect(conditionEngine.getPremiseValue('BOOL_P', ctx)).toBe(true)
    expect(() => conditionEngine.getPremiseValue('UNKNOWN', ctx)).toThrow()
  })

  it('registerPremiseFromExpression——TOML 前提（命名表达式）', () => {
    conditionEngine.registerPremiseFromExpression('IN_TAVERN', 'location.id == "tavern"')
    expect(conditionEngine.evaluate('premise(IN_TAVERN)', ctx)).toBe(true)
    const otherLoc = { ...ctx, location: { id: 'town', name: '城', parent: null, type: 'city', tags: [] } }
    expect(conditionEngine.evaluate('premise(IN_TAVERN)', otherLoc)).toBe(false)
  })

  it('getRegisteredPremiseIds——注册清单（lower 化）', () => {
    conditionEngine.registerPremise('NOT_H', () => true)
    conditionEngine.registerPremise('HAVE_TARGET', () => true)
    const ids = conditionEngine.getRegisteredPremiseIds()
    expect(ids).toContain('not_h')
    expect(ids).toContain('have_target')
  })

  it('clear——清空前提与 AST 缓存', () => {
    conditionEngine.registerPremise('TMP', () => true)
    expect(conditionEngine.evaluate('premise(TMP)', ctx)).toBe(true)
    conditionEngine.clear()
    expect(() => conditionEngine.evaluate('premise(TMP)', ctx)).toThrow()
    expect(conditionEngine.evaluate('player.hp < 100', ctx)).toBe(true)
  })

  // ═══════ B-M-3：quest 域段数/字段守卫（audit-b M-3）═══════
  it('B-M-3：quest 裸根 / 未知字段段 / var 缺键——不抛错返回默认值语义', () => {
    // quest（裸根）——恒 undefined（数值比较走默认值 0，字符串比较恒 false）
    expect(conditionEngine.evaluate('quest == "active"', ctx)).toBe(false)
    expect(conditionEngine.evaluate('quest != null', ctx)).toBe(false)
    // 未知字段段（quest.xxx.zzz）——不被当作 status 解析
    expect(conditionEngine.evaluate('quest.xxx.zzz == "active"', ctx)).toBe(false)
    // var 缺变量键（quest.xxx.var）——undefined
    expect(conditionEngine.evaluate('quest.xxx.var == "y"', ctx)).toBe(false)
    // 合法 3 段 status 不误伤（quest-system 未启用 → callSync 容错 undefined）
    expect(conditionEngine.evaluate('quest.find_master.status == "active"', ctx)).toBe(false)
  })
})
