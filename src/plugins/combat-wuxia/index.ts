// 注释：combat-wuxia 插件——武侠回合制战斗
// extends combat-base，覆盖 damage_calc/hit_check 钩子
// 六维→面板换算 + 武功伤害公式 + 阴阳/暴击/闪避 + 动态指令生成
// TODO Phase 11: 天赋/套装钩子式效果（先手/反击/反伤等），需沙箱

import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { modLoader } from '../../core/mod-loader'
import { narrativeLog } from '../../core/narrative-log'

// 注释：默认六维→面板换算系数（mod 可 override）
// TODO: mod override 机制（通过 config 段或 bindings）
const DEFAULT_COEFFICIENTS = {
  atkStrMul: 1.5,        // ATK = 力道 × 1.5
  defConMul: 0.8,        // DEF = 根骨 × 0.8
  defWillMul: 0.6,       //      + 定力 × 0.6
  hpConMul: 10,          // HP上限 = 根骨 × 10
  mpWillMul: 8,          // MP上限 = 定力 × 8
  dodgeAgiMul: 0.2,      // 闪避 = 灵敏 × 0.2
  critFortMul: 0.2,      // 暴击 = 福缘 × 0.2
}

export function onLoad(_ctx: PluginContext): void {
  // 注释：combat-wuxia 无需提前注册
}

export function onEnable(ctx: PluginContext): void {
  // 注释：覆盖 damage_calc 钩子——武侠伤害公式
  const parentCombat = ctx.parent?.api?.combat
  if (parentCombat?.registerHook) {
    parentCombat.registerHook('damage_calc', wuxiaDamageCalc)
    parentCombat.registerHook('hit_check', wuxiaHitCheck)
  }

  // 注释：注册 combat-wuxia API
  ctx.api.register('combat-wuxia', {
    // 注释：计算面板属性（六维→面板）
    calcPanel: (charId: string): any => {
      return calcPanel(charId)
    },
    // 注释：获取角色的武功（按 tag 分组）
    getAbilitiesByTag: (charId: string, tag: string): any[] => {
      const char = entitySystem.get('character', charId) as any
      if (!char?.abilities) return []
      const mod = modLoader.getMod()
      if (!mod) return []
      return Object.entries(char.abilities)
        .filter(([id]) => mod.abilities[id]?.tags?.includes(tag))
        .map(([id, data]) => ({ id, ...(data as any) }))
    },
  })

  // 注释：动态指令生成——查角色 combat_active 能力按 tag 分组注册
  // TODO: 完整动态指令（按角色能力注册），MVP 先注册"使用武功"占位
  // 实际实现需要在战斗开始时根据角色能力动态注册指令
}

// 注释：武侠伤害公式
// damage = (ATK × 武器系数(1+coeff/100) × 武功倍率(1+power/200) - DEF×2 + 天赋加成) × 阴阳克制(1.15) × 暴击(1.5) × 浮动(0.9-1.1) - 闪避判定
async function wuxiaDamageCalc(ctx: any): Promise<number> {
  const { sourceId, targetId, params } = ctx

  const panel = calcPanel(sourceId)
  const targetPanel = calcPanel(targetId)

  // 注释：基础值
  const atk = panel.atk
  const def = targetPanel.def

  // 注释：武功倍率——如果有 params.abilityId，查武功定义
  let weaponCoeff = 1.0  // 注释：武器系数
  let powerMul = 1.0     // 注释：武功倍率
  const mod = modLoader.getMod()
  if (params?.abilityId && mod) {
    const abilityDef = mod.abilities[params.abilityId]
    if (abilityDef) {
      // 注释：武功倍率 = 1 + power/200
      powerMul = 1 + (abilityDef.power ?? 0) / 200
      // 注释：武器系数——查角色对应系数属性
      // TODO: 根据 ability tags 查对应系数（sword→御剑系数等）
    }
  }

  // 注释：基础伤害 = ATK × 武器系数 × 武功倍率 - DEF×2
  let baseDamage = atk * weaponCoeff * powerMul - def * 2
  baseDamage = Math.max(1, baseDamage)

  // 注释：天赋/套装加成——TODO Phase 11（需 effects 汇总）
  // 暂时不加

  // 注释：阴阳克制——内功阴阳属性不同时 ×1.15
  // TODO: 查角色内功的阴阳属性
  const yinYangMul = 1.0 // 注释：默认无克制

  // 注释：暴击判定
  const critRate = panel.critRate + (params?.crit_rate ?? 0)
  const isCrit = Math.random() < critRate
  const critMul = isCrit ? 1.5 : 1.0

  // 注释：浮动
  const floatMul = 0.9 + Math.random() * 0.2

  // 注释：闪避判定
  const hitRate = 1.0 - targetPanel.dodgeRate
  const isHit = Math.random() < hitRate
  if (!isHit) {
    narrativeLog.write(`${getCharName(targetId)} 闪避了攻击！`, 'combat', 'combat-wuxia')
    return 0
  }

  // 注释：最终伤害
  const finalDamage = Math.max(1, Math.floor(baseDamage * yinYangMul * critMul * floatMul))

  if (isCrit) {
    narrativeLog.write(`**暴击！** 造成 ${finalDamage} 点伤害`, 'combat', 'combat-wuxia')
  }

  return finalDamage
}

// 注释：武侠命中判定
// 命中率 = skill.accuracy + 灵敏/2 - 敌方灵敏/3
async function wuxiaHitCheck(ctx: any): Promise<boolean> {
  const { sourceId, targetId } = ctx
  const sourcePanel = calcPanel(sourceId)
  const targetPanel = calcPanel(targetId)
  // 注释：命中率 = 灵敏/2 - 敌方灵敏/3 + skill.accuracy
  const hitRate = (sourcePanel.agi ?? 0) / 2 - (targetPanel.agi ?? 0) / 3 + 0.8 // 注释：0.8 基础命中率
  return Math.random() < Math.max(0.1, Math.min(0.95, hitRate))
}

// 注释：六维→面板换算
function calcPanel(charId: string): any {
  const char = entitySystem.get('character', charId) as any
  if (!char) return { atk: 0, def: 0, hp: 0, mp: 0, dodgeRate: 0, critRate: 0, agi: 0 }

  const base = char.base ?? {}
  // 注释：六维属性
  const str = base['力道'] ?? 0
  const con = base['根骨'] ?? 0
  const will = base['定力'] ?? 0
  const agi = base['灵敏'] ?? 0
  const fort = base['福缘'] ?? 0

  // 注释：面板属性
  const atk = str * DEFAULT_COEFFICIENTS.atkStrMul + (base['attack'] ?? 0)
  const def = con * DEFAULT_COEFFICIENTS.defConMul + will * DEFAULT_COEFFICIENTS.defWillMul + (base['defense'] ?? 0)
  const hp = con * DEFAULT_COEFFICIENTS.hpConMul + (base['hp'] ?? 0)
  const mp = will * DEFAULT_COEFFICIENTS.mpWillMul + (base['mp'] ?? 0)
  const dodgeRate = agi * DEFAULT_COEFFICIENTS.dodgeAgiMul / 100 // 注释：百分比
  const critRate = fort * DEFAULT_COEFFICIENTS.critFortMul / 100

  return { atk, def, hp, mp, dodgeRate, critRate, agi, str, con, will, fort }
}

function getCharName(charId: string): string {
  const char = entitySystem.get('character', charId) as any
  return char?.name ?? charId
}
