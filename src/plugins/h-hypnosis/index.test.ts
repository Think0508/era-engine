// 注释：h-hypnosis 催眠天赋落账测试（audit-b I4）
// 背景：checkHypnosisCompletion 写 `ch.talent[71/72/73]` 数值键——引擎按名存
// ch.talents（talents.toml:280-296：已催眠·浅/深/极）→ 催眠天赋永不落账
// （judge 修正/口上/完全催眠不可达）。

import { describe, it, expect, beforeEach } from 'vitest'
import { entitySystem } from '../../core/entity-system'
import { checkHypnosisCompletion, DEFAULT_HYPNOSIS } from './index'

function player(): any { return entitySystem.get('character', 'player') as any }
function npc(): any { return entitySystem.get('character', 'npc_1') as any }

describe('h-hypnosis 催眠天赋落账（audit-b I4）', () => {
  beforeEach(() => {
    entitySystem.clear()
    entitySystem.register('character', 'player', { id: 'player', name: '玩家' })
    entitySystem.register('character', 'npc_1', { id: 'npc_1', name: '测试NPC' })
  })

  it('浅催眠（degree≥50 + 玩家331）→ talents["已催眠·浅"] 落账，不写 talent[71]', () => {
    player().experience = { hypnosis: 1 }
    const n = npc()
    n.hypnosis = { ...DEFAULT_HYPNOSIS, hypnosis_degree: 50 }
    expect(checkHypnosisCompletion('npc_1')).toBe(true)
    expect(n.talents?.['已催眠·浅']).toBe(1)
    expect(n.talent?.[71]).toBeUndefined()
  })

  it('深度催眠（degree≥100 + 玩家332）→ talents["已催眠·深"] 落账', () => {
    player().experience = { hypnosis: 10 }
    const n = npc()
    n.hypnosis = { ...DEFAULT_HYPNOSIS, hypnosis_degree: 100 }
    expect(checkHypnosisCompletion('npc_1')).toBe(true)
    expect(n.talents?.['已催眠·浅']).toBe(1)
    expect(n.talents?.['已催眠·深']).toBe(1)
    expect(n.talent?.[72]).toBeUndefined()
  })

  it('完全催眠（degree≥200 + 玩家334）→ talents["已催眠·极"] 落账（浅/深随链触发）', () => {
    player().experience = { hypnosis: 200 }
    const n = npc()
    n.hypnosis = { ...DEFAULT_HYPNOSIS, hypnosis_degree: 200 }
    expect(checkHypnosisCompletion('npc_1')).toBe(true)
    expect(n.talents?.['已催眠·浅']).toBe(1)
    expect(n.talents?.['已催眠·深']).toBe(1)
    expect(n.talents?.['已催眠·极']).toBe(1)
    expect(n.talent?.[73]).toBeUndefined()
  })

  it('玩家天赋不足 → 不落账', () => {
    player().experience = {}
    const n = npc()
    n.hypnosis = { ...DEFAULT_HYPNOSIS, hypnosis_degree: 100 }
    expect(checkHypnosisCompletion('npc_1')).toBe(false)
    expect(n.talents?.['已催眠·深']).toBeUndefined()
  })
})
