// 注释：角色契约校验器注册表（标准角色契约 spec §10.1 Step 5）
// 纯通用机制：core 层不认任何具体属性名——"最小必需集"等具体字段清单由插件层注册
// （h-core 注册 H/结算必需字段校验）。mod-loader 加载角色后调用全部注册的校验器。
// 校验失败一律 warning+建议（errorReporter），不阻止加载。

import type { EntityData } from './types'
import type { LoadedMod } from './mod-loader'
import { errorReporter } from './error-reporter'

export interface CharacterValidator {
  /** 校验器 ID（插件名） */
  id: string
  /**
   * 校验单个角色。禁止 throw（契约铁律：校验失败 warning+建议，不阻止加载）——
   * 内部用 errorReporter.report({severity: 'warning', ...})
   */
  validate: (charId: string, char: EntityData, mod: LoadedMod) => void
}

const validators = new Map<string, CharacterValidator>()

export function registerCharacterValidator(validator: CharacterValidator): void {
  if (validators.has(validator.id)) {
    // 重复注册 → 覆盖并警告（插件重载/幂等场景）；铁律：走 errorReporter，禁止 console
    errorReporter.report({
      source: 'character-contract',
      severity: 'warning',
      message: `校验器 '${validator.id}' 重复注册，后者覆盖`,
      suggestion: '插件重复 onLoad 会重复注册；如需幂等请在插件侧加守卫',
    })
  }
  validators.set(validator.id, validator)
}

export function getCharacterValidators(): CharacterValidator[] {
  return [...validators.values()]
}

export function clearCharacterValidators(): void {
  validators.clear()
}
