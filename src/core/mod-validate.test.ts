// 注释：npm run validate 入口（AGENTS §15）——脱离游戏独立校验全部 mod 数据文件
// 复用 mod-loader parseModData 全链路校验（TOML 解析 + 裸字段 + 分层 + 引用存在性 + 契约最终化），
// 零重复实现；插件默认层（src/plugins/*/data/default/）与 loadMod 一致地并入。
// 判定：parse 不 throw + errorReporter 无 severity=error；warning 打印供人工查看。

import { describe, it, expect } from 'vitest'
import { parseModData } from './mod-loader'
import { errorReporter } from './error-reporter'

// 注释：eager 同步 glob（与 loadMod 组装逻辑一致）
const modMetaModules = import.meta.glob('/mods/*/meta.toml', {
  import: 'default',
  eager: true,
}) as Record<string, string>

const modTomlModules = import.meta.glob('/mods/**/*.toml', {
  import: 'default',
  eager: true,
}) as Record<string, string>

const pluginDefaultModules = import.meta.glob('/src/plugins/*/data/default/**/*.toml', {
  import: 'default',
  eager: true,
}) as Record<string, string>

const modNames = Object.keys(modMetaModules)
  .map(p => p.match(/\/mods\/([^/]+)\/meta\.toml$/)?.[1])
  .filter((name): name is string => !!name)

function buildRawMap(modName: string): Record<string, string> {
  return {
    ...pluginDefaultModules,
    ...Object.fromEntries(
      Object.entries(modTomlModules).filter(([path]) => path.startsWith(`/mods/${modName}/`)),
    ),
  }
}

describe('validate——全 mod 数据文件离线校验（npm run validate）', () => {
  it('发现 mod 列表（mods/*/meta.toml）', () => {
    expect(modNames.length).toBeGreaterThan(0)
  })

  for (const modName of modNames) {
    it(`${modName}：TOML 解析 + 结构校验无 error（warning 打印）`, () => {
      errorReporter.clear()
      const mod = parseModData(modName, buildRawMap(modName))
      expect(mod).toBeDefined()
      expect(mod.id).toBe(modName)

      const errors = errorReporter.getErrors()
      const errs = errors.filter(e => e.severity === 'error')
      const warns = errors.filter(e => e.severity === 'warning')
      for (const w of warns) {
        console.info(`[validate:${modName}] warning: ${w.message}${w.suggestion ? ` → ${w.suggestion}` : ''}`)
      }
      expect(errs).toHaveLength(0)
    })
  }

  it('example-mod 加载冒烟：player 存在 + 起始地点存在（照猫画虎的可复制性保证）', async () => {
    const { modLoader } = await import('./mod-loader')
    await modLoader.loadMod('example-mod')
    const mod = modLoader.getMod()
    expect(mod).toBeDefined()
    expect(mod!.playerCharacter).toBeTruthy()
    const player = mod!.entities.get('character')?.get(mod!.playerCharacter!)
    expect(player).toBeDefined()
    expect(mod!.locations.has(mod!.startingLocation!)).toBe(true)
  })
})
