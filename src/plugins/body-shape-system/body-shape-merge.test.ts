// 注释：loadBodyShape 合并契约测试（mod 层覆盖插件默认层）——2026-08 架构复盘补测试盲区
// 验证：①mod 显式字段覆盖插件默认（default/min/max）②插件默认档全部保留（增改不删）
// ③mod 可新增档位 ④维度级 sex 与未覆盖维度（身高/阴茎）原样保留 ⑤合并后各档 min 单调
// ⚠️ 中文档名经变量间接取（scan-attr-refs 会把 'tiers[中文]' 判为属性引用，属结构数据）

import { describe, it, expect } from 'vitest'
import { parseModData } from '../../core/mod-loader'

// 真读插件默认文件（单一事实源，避免测试内复制漂移）
const defaultBodyShapeRaw = import.meta.glob(
  '/src/plugins/body-shape-system/data/default/body-shape.toml',
  { query: '?raw', import: 'default', eager: true },
)['/src/plugins/body-shape-system/data/default/body-shape.toml'] as string

const META = '/mods/bs-merge/meta.toml'
const DEFAULT = '/src/plugins/body-shape-system/data/default/body-shape.toml'
const MOD = '/mods/bs-merge/definitions/body-shape.toml'

// ⚠️ 合并语义是"增改不删"：插件默认档永远在（mod 只能覆盖 min/max/default/sex 或新增档）
const modOverride = `
[body_shape]
[body_shape.chest]
default = "巨乳"
[body_shape.chest.tiers]
"普乳" = { min = 80, max = 95 }
"超巨乳" = { min = 105, max = 130 }
`

function buildMod(): any {
  return parseModData('bs-merge', {
    [META]: '[meta]\nid = "bs-merge"\nname = "bs-merge"\nversion = "1.0.0"\n',
    [DEFAULT]: defaultBodyShapeRaw,
    [MOD]: modOverride,
  } as any)
}

function tier(mod: any, dim: string, name: string): any {
  return mod.bodyShape?.[dim]?.tiers?.[name]
}

describe('body-shape.toml 合并契约（mod 覆盖插件默认）', () => {
  it('mod 显式覆盖胜出：chest default / 普乳 min/max 被 mod 值替换', () => {
    const mod = buildMod()
    expect(mod.bodyShape.chest.default).toBe('巨乳')
    expect(tier(mod, 'chest', '普乳')).toEqual({ min: 80, max: 95 })
  })

  it('插件默认档全部保留（增改不删）：绝壁/贫乳/巨乳/爆乳 + 臀/身高/阴茎维度', () => {
    const mod = buildMod()
    expect(tier(mod, 'chest', '绝壁')).toEqual({ min: 70, max: 75 })
    expect(tier(mod, 'chest', '贫乳')).toEqual({ min: 75, max: 80 })
    expect(tier(mod, 'chest', '巨乳')).toEqual({ min: 90, max: 100 })
    expect(tier(mod, 'chest', '爆乳')).toEqual({ min: 100, max: 999 })
    expect(tier(mod, 'hip', '巨臀')).toEqual({ min: 90, max: 999 })
    expect(mod.bodyShape.height.default).toBe('标准')
    expect(mod.bodyShape.penis.sex).toBe('male')   // 插件默认的维度级性别闸保留
  })

  it('mod 可新增档位（超巨乳 105-130），合并后各档 min 仍单调可排序', () => {
    const mod = buildMod()
    expect(tier(mod, 'chest', '超巨乳')).toEqual({ min: 105, max: 130 })
    const mins = Object.values(mod.bodyShape.chest.tiers as Record<string, { min: number }>).map(t => t.min)
    expect([...mins].sort((a, b) => a - b)).toEqual(mins)
  })

  it('无 body-shape.toml 时 bodyShape 为空对象（未装配时优雅缺失）', () => {
    const mod = parseModData('bs-empty', {
      '/mods/bs-empty/meta.toml': '[meta]\nid = "bs-empty"\nname = "bs-empty"\nversion = "1.0.0"\n',
    } as any)
    expect(mod.bodyShape).toEqual({})
  })
})