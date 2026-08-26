// 注释：喜欢的体位/部位（2026-08-25）单元与集成测试
// 覆盖：阈值/分数、部位解析、迁移、快感归属（谁有喜好谁加）、判定只看客体

import { describe, it, expect, beforeAll } from 'vitest'
import { modLoader } from '../../core/mod-loader'
import { entitySystem } from '../../core/entity-system'
import { gameContext } from '../../core/game-context'
import { conditionEngine } from '../../core/condition-engine'
import { errorReporter } from '../../core/error-reporter'
import { apiSystem } from '../../core/api'
import { commandRegistry } from '../../core/command-registry'
import { eventBus } from '../../core/event-bus'
import { onLoad as effectOnLoad, onEnable as effectOnEnable } from '../effect-system/index'
import { onLoad as hCoreOnLoad, onEnable as hCoreOnEnable } from './index'
import { calcJudge } from './settle/judge'
import { getFeelExtraAdjust } from './settle/state-settle'
import {
  addFavoriteScore, favoritePositionIds, favoritePartKeys, isFavoritePosition, isFavoritePart,
  resolvePartKey, actionPartKeyFromHState, migrateLegacyFavoritePosition, getFavoriteConfig,
  favoritePartApplies, recordPartUseAndScore, getPartDisplayName,
} from './settle/favorite'
import { resetCharacterEntity, DEFAULT_NPC_BASE } from '../../utils/test-helpers'

const stubCtx: any = {
  api: apiSystem,
  events: eventBus,
  commands: commandRegistry,
  ui: { registerSlot: () => {} },
}

function npc(id = 'npc_1'): any {
  return entitySystem.get('character', id) as any
}

describe('favorite（喜欢的体位/部位）', () => {
  beforeAll(async () => {
    entitySystem.clear()
    commandRegistry.clear()
    errorReporter.clear()
    conditionEngine.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    gameContext.setPlayer('player')
    gameContext.setLocation(mod.locations.values().next().value as any)

    effectOnLoad(stubCtx)
    effectOnEnable(stubCtx)
    hCoreOnLoad(stubCtx)
    hCoreOnEnable(stubCtx)

    for (const id of ['npc_1', 'npc_fav', 'npc_nofav']) {
      entitySystem.register('character', id, { id, name: `测试${id}`, base: {} })
      resetCharacterEntity(npc(id), DEFAULT_NPC_BASE)
    }
  })

  it('默认配置：体位阈值 100 / 部位阈值 1000 / 加成与女体侧', () => {
    const cfg = getFavoriteConfig()
    expect(cfg.position_threshold).toBe(100)
    expect(cfg.part_threshold).toBe(1000)
    expect(cfg.position_feel_bonus).toBe(0.5)
    expect(cfg.position_judge_bonus).toBe(30)
    expect(cfg.part_feel_bonus).toBe(0.2)
    expect(cfg.part_judge_bonus).toBe(10)
    expect(cfg.body_side).toBe('female')
  })

  it('分数/阈值：体位 100、部位 1000；低于阈值不算喜欢', () => {
    const ch = npc('npc_1')
    ch.favorite = { positions: {}, parts: {} }
    addFavoriteScore(ch, 'positions', '1')
    expect(favoritePositionIds(ch)).toEqual([])
    for (let i = 0; i < 99; i++) addFavoriteScore(ch, 'positions', '1')
    expect(isFavoritePosition(ch, 1)).toBe(true)
    expect(favoritePositionIds(ch)).toContain(1)

    addFavoriteScore(ch, 'parts', '6')
    expect(isFavoritePart(ch, '6')).toBe(false)
    for (let i = 0; i < 999; i++) addFavoriteScore(ch, 'parts', '6')
    expect(isFavoritePart(ch, '6')).toBe(true)
    expect(favoritePartKeys(ch)).toContain('6')
  })

  it('部位解析：tag、中文名、数字键、insert_position 均归一化', () => {
    expect(resolvePartKey('vagina')).toBe('6')
    expect(resolvePartKey('阴道')).toBe('6')
    expect(resolvePartKey('6')).toBe('6')
    expect(resolvePartKey('mental')).toBe('mental')
    const ch = npc('npc_1')
    ch.h_state = { insert_position: 0 }
    expect(actionPartKeyFromHState(ch)).toBe('6')
    ch.h_state = { insert_position: 4 }
    expect(actionPartKeyFromHState(ch)).toBe('2')
  })

  it('迁移：旧体位经验 141-152 ≥100 与旧 favorite_position 天赋均写入 favorite.positions 并清旧天赋', () => {
    const ch = npc('npc_1')
    ch.experience = { '141': 100, '142': 200 }
    ch.talents = { 正常位喜好: 1, 背后位喜好: 0 }
    const mod = modLoader.getMod()!
    // 旧正常位喜好天赋经 LEGACY_FAVORITE_POSITION_TALENTS 静态映射迁移
    migrateLegacyFavoritePosition(ch, mod)
    expect(ch.favorite.positions['1']).toBe(100)
    expect(ch.favorite.positions['2']).toBe(100)
    expect(ch.talents['正常位喜好'] ?? 0).toBe(0)
  })

  it('快感归属：谁有该喜好，谁自己的快感结算加成', () => {
    const fav = npc('npc_fav')
    const no = npc('npc_nofav')
    fav.favorite = { positions: { '1': 100 }, parts: {} }
    no.favorite = { positions: {}, parts: {} }
    fav.h_state = { current_sex_position: 1 }
    no.h_state = { current_sex_position: 1 }
    const favExtra = getFeelExtraAdjust(fav, '阴道', [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], false)
    const noExtra = getFeelExtraAdjust(no, '阴道', [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], false)
    // pos 1（正常位）pleasure_coefficient=0；喜欢体位 +0.5
    expect(noExtra).toBe(0)
    expect(favExtra).toBeCloseTo(0.5, 5)
  })

  it('判定只看客体：客体喜欢体位/部位时把退缩变为部分成功；发起方喜欢不影响', () => {
    const fav = npc('npc_fav')
    const no = npc('npc_nofav')
    fav.favorite = { positions: { '1': 100 }, parts: { '6': 1000 } }
    fav.h_state = { current_sex_position: 1, insert_position: 0 }
    no.favorite = { positions: {}, parts: {} }
    no.h_state = { current_sex_position: 1, insert_position: 0 }
    expect(isFavoritePosition(fav, 1)).toBe(true)
    expect(isFavoritePart(fav, '6')).toBe(true)
    // 处女惩罚 -250：基准 550 → 无喜欢 300 < 330 退缩；喜欢体位 +30 → 330 部分成功
    const noPos = calcJudge(650, 0, 0, 'npc_nofav', '性交')
    const favPos = calcJudge(650, 0, 0, 'npc_fav', '性交')
    expect(noPos.retreated).toBe(true)
    expect(favPos.retreated).toBe(false)
    expect(favPos.partial).toBe(true)
    // 部位判定：基准 680、处女 -250 → 无喜欢 <408 退缩；喜欢部位 +10 → ≥408 部分成功
    const noPart = calcJudge(680, 0, 0, 'npc_nofav', '性交', '6')
    const favPart = calcJudge(680, 0, 0, 'npc_fav', '性交', '6')
    expect(noPart.retreated).toBe(true)
    expect(favPart.retreated).toBe(false)
    expect(favPart.partial).toBe(true)
  })

  it('判定链文本：命中喜欢体位/部位时输出 喜欢背后位+30 / 喜欢小穴+10', () => {
    const fav = npc('npc_fav')
    fav.favorite = { positions: { '2': 100 }, parts: { '6': 1000 } }
    fav.h_state = { current_sex_position: 2, insert_position: 0 }
    const r = calcJudge(500, 0, 0, 'npc_fav', '性交', '6')
    expect(r.reasonText).toContain('需要性爱实行值至少为500')
    expect(r.reasonText).toContain('好感修正(')
    expect(r.reasonText).toContain('+信赖修正(')
    expect(r.reasonText).toContain('+喜欢背后位(30)')
    expect(r.reasonText).toContain('+喜欢小穴(10)')
    // 负值格式：-名称(数值)
    expect(r.reasonText).toContain('-处女(250)')
    // 完整文本尾部应包含总值与换行（erArk 原样）
    expect(r.reasonText).toMatch(/ = \d+\n$/)
  })

  it('body_side=female 不限制 mod 扩展部位（皮肤/腿等也可命中）', () => {
    const ch = npc('npc_1')
    ch.favorite = { positions: {}, parts: { '0': 1000, '11': 1000 } }
    expect(favoritePartApplies(ch, '0')).toBe(true)
    expect(favoritePartApplies(ch, '11')).toBe(true)
  })

  it('actionPartKeyFromHState：自己无插入位时回退交互对象', () => {
    const actor = npc('npc_1')
    const partner = npc('npc_fav')
    actor.h_state = { insert_position: -1, target_character_id: 'npc_fav' }
    partner.h_state = { insert_position: 0 }
    expect(actionPartKeyFromHState(actor)).toBe('6')
  })

  it('recordPartUseAndScore：自慰只计一次分数（不双算）', async () => {
    const ch = npc('npc_1')
    ch.favorite = { positions: {}, parts: {} }
    await recordPartUseAndScore('npc_1', 'npc_1', '6', 6)
    expect(ch.favorite.parts['6']).toBe(1)
    expect(ch.favorite.parts['6']).not.toBe(2)
  })

  it('面板 API：getFavoriteList 按分数排序且只返回达阈值项，并带显示名', async () => {
    const ch = npc('npc_1')
    ch.favorite = { positions: { '1': 200, '2': 100, '3': 99 }, parts: { '6': 1000 } }
    const list = await apiSystem.call('h-core', 'getFavoriteList', 'npc_1', 'positions') as { id: string; name: string; score: number }[]
    expect(list).toEqual([
      { id: '1', name: '正常位', score: 200 },
      { id: '2', name: '背后位', score: 100 },
    ])
    const parts = await apiSystem.call('h-core', 'getFavoriteList', 'npc_1', 'parts') as { id: string; name: string; score: number }[]
    expect(parts).toEqual([{ id: '6', name: '小穴', score: 1000 }])
  })

  it('describeFavorites：面板列表文本（口语名 + 排序 + 空集）', async () => {
    const ch = npc('npc_1')
    ch.favorite = { positions: { '2': 200, '1': 100 }, parts: { '6': 1000, '3': 1100, 'mental': 1000 } }
    const text = await apiSystem.call('h-core', 'describeFavorites', 'npc_1') as string
    expect(text).toBe('喜欢的体位：背后位、正常位；喜欢的部位：胸部、小穴、心理')

    ch.favorite = { positions: {}, parts: {} }
    expect(await apiSystem.call('h-core', 'describeFavorites', 'npc_1') as string).toBe('暂无喜欢的体位/部位')
  })

  it('显示名 fallback：未知部位显示 部位{id}', () => {
    expect(getPartDisplayName('11')).toBe('部位11')
  })
})