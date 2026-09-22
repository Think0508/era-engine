// 注释：战斗效果库条目校验（combat-base 自有动作的契约）
//
// 分工：通用契约（delivery/相位/施加器/merge/统计键/通道…）由消费方 combat-wuxia 的
// validateBattleData 负责（它需要动作表已注册）；本文件只校验 **combat-base 自有动作**
// 额外要求的字段——目前是 modify_attribute 的 attr。
//
// 为什么必须校验：modify_attribute 的落点是"属性有效值层"（实体的运行时修正清单 attr_mods），
// 属性名漏写/写错时**没有任何运行时信号**——条目照挂进效果区，但属性有效值管线的闸门要求
// 属性定义存在（readEffective：definitions[name]），未定义的属性只会拿到裸值，
// 效果静默无效（作者以为加了 20 点，实际一点没加）。故在加载期拦下。
//
// 上报姿态沿用本项目战斗校验既有写法（errorReporter.report + 条目名 + 建议，见 combat-wuxia/index.ts）。

import { errorReporter } from '../../core/error-reporter'
import { modLoader } from '../../core/mod-loader'

/**
 * 校验 `definitions/battle-effects.toml` 里 combat-base 自有动作的库条目契约，上报 error。
 * 调用点：onEnable（加载期）+ `game:mod_loaded`（热重载后重跑），与 combat-wuxia 的 validateBattleData 对齐。
 * @returns 本次上报的错误条数（0 = 无问题；测试/调用方可直接断言）
 */
export function validateBattleEffectDefs(): number {
  const mod = modLoader.getMod()
  if (!mod) return 0
  const defs = mod.battleEffects ?? {}
  // 属性定义的权威 = mod.attributes（mod-loader 就是把它注入属性有效值管线的）：
  // 属性不在这里 → 运行时管线不会认它 → 修正被静默丢弃。
  const attrs = (mod as any).attributes ?? {}
  let errors = 0
  for (const id of Object.keys(defs)) {
    const def = defs[id] as any
    if (!def || typeof def !== 'object') continue
    if (def.action !== 'modify_attribute') continue
    const owner = `战斗效果 '${id}'`
    if (typeof def.attr !== 'string' || def.attr.length === 0) {
      errorReporter.report({
        source: 'combat-base', severity: 'error',
        message: `${owner} 的 modify_attribute 缺少 attr 字段（要修正哪个角色属性）`,
        suggestion: `补上 attr 字段并写属性名（例如攻击力/气血），可用属性见 definitions/attributes.toml`,
      })
      errors++
      continue
    }
    if (!attrs[def.attr]) {
      errorReporter.report({
        source: 'combat-base', severity: 'error',
        message: `${owner} 的 modify_attribute 引用了未定义的属性 '${def.attr}'`,
        suggestion: '在 definitions/attributes.toml 定义该属性（未定义 = 属性有效值层不认它，修正静默无效）',
      })
      errors++
    }
  }
  return errors
}
