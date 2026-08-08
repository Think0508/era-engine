// 注释：隐奸/露出持续快感 + 他人存在判定修正测试（2026-08-08）
// 覆盖：
//   1. 隐奸持续快感（erArk realtime_settle.py:602-607）：time×5 × (露出系数 + 4-mode + 他人×0.1)
//   2. 露出持续快感（:610-613）：time×3 × (露出系数 + min(他人×0.1, 2))
//   3. 外层条件：场景人数 ≤2 / 无清醒他人 → 不结算
//   4. 他人存在判定修正（instuct_judege.py:247-260）：S 类 40+40n / 群交隐奸 60+60n / D 类 25+25n，
//      露出调整 int(× (ability_lv_adjust[露出] - 1.6))

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { modLoader } from '../core/mod-loader'
import { gameContext } from '../core/game-context'
import { entitySystem } from '../core/entity-system'
import { apiSystem } from '../core/api'
import { eventBus } from '../core/event-bus'
import { commandRegistry } from '../core/command-registry'
import { errorReporter } from '../core/error-reporter'
import { onLoad as effectOnLoad, onEnable as effectOnEnable } from './effect-system/index'
import { onLoad as hCoreOnLoad, onEnable as hCoreOnEnable } from './h-core/index'
import { onLoad as hiddenOnLoad, onEnable as hiddenOnEnable } from './h-hidden/index'
import { calcJudge } from './h-core/settle/judge'
import { resetCharacterEntity, DEFAULT_NPC_BASE, DEFAULT_PLAYER_BASE } from '../utils/test-helpers'

const stubCtx: any = {
  api: apiSystem,
  events: eventBus,
  commands: commandRegistry,
  ui: { registerSlot: () => {} },
}

function npc(): any {
  return entitySystem.get('character', 'npc_1') as any
}

describe('隐奸/露出持续快感 + 他人存在判定修正（erArk realtime_settle + instuct_judege 对齐）', () => {
  beforeAll(async () => {
    entitySystem.clear()
    errorReporter.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    gameContext.setPlayer('player')
    gameContext.setLocation(mod.locations.values().next().value as any)
    effectOnLoad(stubCtx)
    effectOnEnable(stubCtx)
    hCoreOnLoad(stubCtx)
    hCoreOnEnable(stubCtx)
    hiddenOnLoad(stubCtx)
    hiddenOnEnable(stubCtx)
    const p = entitySystem.get('character', 'player') as any
    resetCharacterEntity(p, DEFAULT_PLAYER_BASE)
    p.current_location = 'town_square'
    entitySystem.register('character', 'npc_1', { id: 'npc_1', name: '测试NPC', base: {}, current_location: 'town_square' })
    resetCharacterEntity(npc(), DEFAULT_NPC_BASE)
    // 路人（同地点，清醒）
    entitySystem.register('character', 'passerby', { id: 'passerby', name: '路人', base: {}, current_location: 'town_square' })
    resetCharacterEntity(entitySystem.get('character', 'passerby') as any, DEFAULT_NPC_BASE)
  })

  afterEach(async () => {
    // 重置角色状态（防跨测试污染）+ 退出 h_scene 模式
    await gameContext.exitMode()
    const n = npc()
    n.sp_flag = {}
    n.base['羞耻'] = 0
    n.base['心理'] = 0
    n.abilities = {}
    n.h_state = undefined
  })

  async function tick(minutes: number): Promise<void> {
    // 隐奸持续快感在 H 行动中结算（h-hidden execution_end 监听要求 h_scene 模式）
    await gameContext.enterMode('h_scene')
    await eventBus.emit('game:execution_end', { commandId: 'test', timeCost: minutes })
  }

  describe('隐奸持续快感（realtime_settle.py:602-607）', () => {
    it('隐奸 mode1 + 同地点 3 人（他人 1）→ 羞耻/心理 += 50 × (1.0 + 4-1 + 1×0.1) = 204', async () => {
      const n = npc()
      n.sp_flag = { hidden_sex_mode: 1 }
      n.base['羞耻'] = 0
      n.base['心理'] = 0
      await tick(10)
      // time×5 = 50；coeff = ability_lv_adjust[露出0]=1.0 + (4-1) + 1×0.1 = 4.1
      // 注：IEEE 754 下 50×4.1 = 204.999... → floor/int 204（erArk Python int() 同值）
      expect(n.base['羞耻']).toBe(204)
      expect(n.base['心理']).toBe(204)
    })

    it('隐奸 mode4（半公开）→ 系数 4-4=0 + 他人×0.1 → 50 × 1.1 = 55', async () => {
      const n = npc()
      n.sp_flag = { hidden_sex_mode: 4 }
      n.base['羞耻'] = 0
      n.base['心理'] = 0
      await tick(10)
      expect(n.base['羞耻']).toBe(Math.floor(50 * 1.1))
    })

    it('露出能力等级生效：露出 lv5（adjust 1.8）→ 50 × (1.8 + 3.1) = 245', async () => {
      const n = npc()
      n.sp_flag = { hidden_sex_mode: 1 }
      n.abilities = { 露出: { level: 5, xp: 0 } }
      n.base['羞耻'] = 0
      n.base['心理'] = 0
      await tick(10)
      expect(n.base['羞耻']).toBe(Math.floor(50 * (1.8 + 3.1)))
    })

    it('场景人数 ≤2 → 不结算（无人旁观不刺激）', async () => {
      const n = npc()
      n.sp_flag = { hidden_sex_mode: 1 }
      n.base['羞耻'] = 0
      // 暂时移走路人 → 场景只有 player + npc
      entitySystem.get('character', 'passerby')!.current_location = 'elsewhere'
      await tick(10)
      expect(n.base['羞耻']).toBe(0)
      entitySystem.get('character', 'passerby')!.current_location = 'town_square'
    })
  })

  describe('露出持续快感（realtime_settle.py:610-613）', () => {
    it('露出模式 → 羞耻/心理 += 30 × (1.0 + min(1×0.1,2)) = 33', async () => {
      const n = npc()
      n.sp_flag = { exhibitionism_sex_mode: 1 }
      n.base['羞耻'] = 0
      n.base['心理'] = 0
      await tick(10)
      // time×3 = 30；coeff = 1.0 + min(0.1, 2) = 1.1 → 33
      expect(n.base['羞耻']).toBe(33)
      expect(n.base['心理']).toBe(33)
    })
  })

  describe('隐奸绝顶暴露（h:orgasm → 暴露值/成就挂玩家——erArk character_id=0）', () => {
    it('玩家绝顶（隐奸模式）→ 玩家暴露值增加 + 成就记录；NPC 不增加', async () => {
      const p = entitySystem.get('character', 'player') as any
      p.sp_flag = { hidden_sex_mode: 1 }
      p.h_state = { hidden_sex_discovery_dregree: 0 }
      p.achievement = undefined
      const n = npc()
      n.base['羞耻'] = 0
      n.h_state = { hidden_sex_discovery_dregree: 0 }

      await eventBus.emit('h:orgasm', { character: 'player', partId: 4, level: 0, count: 1, extra: false })

      // 暴露值挂玩家（发起方）：delta = duration×intensity×mode_adjust/隐蔽能力×他人数（clamp 0-100）；
      // 断言 >0（test-mod 场景人数不确定，仅验证挂玩家且生效）
      expect(p.h_state.hidden_sex_discovery_dregree).toBeGreaterThan(0)
      expect(p.h_state.hidden_sex_discovery_dregree).toBeLessThanOrEqual(100)
      // 成就 rec[4]（隐藏方绝顶）挂玩家
      expect(p.achievement.hidden_sex_record[4]).toBe(1)
      // NPC（绝顶者非玩家时不被结算）——本测试绝顶者即玩家；NPC 暴露值不受影响
      expect(n.h_state.hidden_sex_discovery_dregree).toBe(0)
      p.sp_flag = {}
      p.h_state = undefined
      n.h_state = undefined
    })
  })

  describe('他人存在判定修正（instuct_judege.py:247-260）', () => {
    // 注释：已破处标记——避免 hConfig 处女惩罚修正（-250 等）干扰他人存在修正的独立验证
    function markDeflowered(): void {
      const n = npc()
      n.first_times = { virgin_V: true, virgin_A: true, virgin_W: true, virgin_KISS: true }
    }

    it('S 类（性交）4 人场景 + 露出0 → 40+40×2=120 × (1.0-1.6) = -72 → partial', () => {
      markDeflowered()
      const n = npc()
      n.base['好感度'] = 0
      n.base['信赖度'] = 0
      const result = calcJudge(500, 0, 0, 'npc_1', '性交')
      // 500 - 72 = 428；≥ 500×0.6=300 → partial（场景 2 人时为 success）
      expect(result.success).toBe(false)
      expect(result.partial).toBe(true)
    })

    it('场景 2 人 → 无他人存在修正 → success', () => {
      markDeflowered()
      const passerby = entitySystem.get('character', 'passerby') as any
      passerby.current_location = 'elsewhere'
      const result = calcJudge(500, 0, 0, 'npc_1', '性交')
      expect(result.success).toBe(true)
      passerby.current_location = 'town_square'
    })

    it('露出 lv10（adjust 4.0）→ 120 × (4.0-1.6) = +288 → success', () => {
      markDeflowered()
      const n = npc()
      n.abilities = { 露出: { level: 10, xp: 0 } }
      const result = calcJudge(500, 0, 0, 'npc_1', '性交')
      // 500 + 288 = 788 ≥ 500 → success
      expect(result.success).toBe(true)
      n.abilities = {}
    })

    it('群交判定 → 60 档（60+60×2=180 × (1.0-1.6) = -108 → 392 → partial）', () => {
      markDeflowered()
      const result = calcJudge(500, 0, 0, 'npc_1', '群交')
      expect(result.partial).toBe(true)
      expect(result.success).toBe(false)
    })
  })
})
