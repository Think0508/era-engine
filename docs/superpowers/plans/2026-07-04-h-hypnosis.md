# h-hypnosis 催眠子系统实现方案（第一阶段）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development

**Goal:** 实现催眠核心机制——程度增长、4 种类型、7 个子状态效果、理智消耗、公式集成

**Architecture:** 单文件插件 (plugin.toml + index.ts)，遵循现有 H 插件模式

**Spec:** `docs/superpowers/specs/2026-07-04-h-hypnosis-design.md`

---

## 全局约束

- 禁止私自简化 erArk 公式——每个数值必须有源码可追溯
- 前提注册通过 `ctx.api.call('h-core', 'registerPremise', id, fn)`
- 效果注册通过 `effectTypeRegistry.register('effect_name', handler)`

---

### Task 1: 插件脚手架 + 数据结构

- [ ] Step 1: 创建 `src/plugins/h-hypnosis/plugin.toml`
```toml
[meta]
id = "h-hypnosis"
name = "催眠系统"
version = "1.0.0"
description = "催眠核心机制 - 程度/类型/子状态/公式（第一阶段）"

[data_dependencies]
provides = ["hypnosis:ready"]
depends_on = ["h:ready"]
```

- [ ] Step 2: 创建 `index.ts` 骨架（数据类型 + 常量 + 空壳）
```typescript
import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { narrativeLog } from '../../core/narrative-log'
import { gameContext } from '../../core/game-context'
import { apiSystem } from '../../core/api'

interface HypnosisData {
  hypnosis_degree: number
  increase_body_sensitivity: boolean
  force_ovulation: boolean
  blockhead: boolean
  active_h: boolean
  pain_as_pleasure: boolean
  roleplay: number[]
}

const DEFAULT_HYPNOSIS: HypnosisData = {
  hypnosis_degree: 0, increase_body_sensitivity: false, force_ovulation: false,
  blockhead: false, active_h: false, pain_as_pleasure: false, roleplay: [],
}

const HYPNOSIS_TYPE_NAMES = ['无', '平然催眠', '空气催眠', '体控催眠', '心控催眠']

function getSelfId(ctx: any): string | null { return ctx.gameStore?.player?.id ?? ctx.sourceId ?? null }
function getTargetId(ctx: any): string | null { return ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId ?? null }

function getHypnosis(charId: string): HypnosisData {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return { ...DEFAULT_HYPNOSIS }
  if (!ch.hypnosis) ch.hypnosis = { ...DEFAULT_HYPNOSIS }
  return ch.hypnosis
}

function getUnconsciousH(charId: string): number {
  const ch = entitySystem.get('character', charId) as any
  return ch?.sp_flag?.unconscious_h ?? 0
}

function setUnconsciousH(charId: string, val: number): void {
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return; if (!ch.sp_flag) ch.sp_flag = {}
  ch.sp_flag.unconscious_h = val
}

let lastHypnosisType = 1

export function onLoad(_ctx: PluginContext): void { /* TODO Task 3 */ }
export async function onEnable(ctx: PluginContext): Promise<void> { /* TODO Task 2 */ }
```

- [ ] Step 3: `npm run typecheck`

---

### Task 2: 前提注册

在 `onEnable` 中添加 `reg` 辅助 + 所有催眠前提：

```typescript
const reg = (id: string, fn: (c: any) => boolean) => {
  try { ctx.api.call('h-core', 'registerPremise', id, fn) } catch { }
}

// 能力前提
reg('PRIMARY_HYPNOSIS', () => true)      // TODO: 天赋检查
reg('INTERMEDIATE_HYPNOSIS', () => true)
reg('ADVANCED_HYPNOSIS', () => true)
reg('SPECIAL_HYPNOSIS', () => true)

// 程度前提
reg('SELF_HYPNOSIS_0', (ctx2: any) => { const id = getSelfId(ctx2); return id ? getHypnosis(id).hypnosis_degree === 0 : false })
reg('T_HYPNOSIS_0', (ctx2: any) => { const id = getTargetId(ctx2); return id ? getHypnosis(id).hypnosis_degree === 0 : false })
reg('SELF_HYPNOSIS_NE_0', (ctx2: any) => { const id = getSelfId(ctx2); return id ? getHypnosis(id).hypnosis_degree !== 0 : false })
reg('T_HYPNOSIS_NE_0', (ctx2: any) => { const id = getTargetId(ctx2); return id ? getHypnosis(id).hypnosis_degree !== 0 : false })

// 状态前提
reg('IN_HYPNOSIS', (ctx2: any) => { const id = getSelfId(ctx2); if (!id) return false; const u = getUnconsciousH(id); return u >= 4 && u <= 7 })
reg('NOT_IN_HYPNOSIS', (ctx2: any) => { const id = getSelfId(ctx2); if (!id) return false; const u = getUnconsciousH(id); return u < 4 || u > 7 })
reg('T_IN_HYPNOSIS', (ctx2: any) => { const id = getTargetId(ctx2); if (!id) return false; const u = getUnconsciousH(id); return u >= 4 && u <= 7 })
reg('T_NOT_IN_HYPNOSIS', (ctx2: any) => { const id = getTargetId(ctx2); if (!id) return false; const u = getUnconsciousH(id); return u < 4 || u > 7 })

// 子状态前提 - 每个子状态 4 个版本
function regSubState(name: string, getter: (h: HypnosisData) => boolean) {
  reg(`HYPNOSIS_${name}`, (ctx2: any) => { const id = getSelfId(ctx2); return id ? getter(getHypnosis(id)) : false })
  reg(`NOT_HYPNOSIS_${name}`, (ctx2: any) => { const id = getSelfId(ctx2); return id ? !getter(getHypnosis(id)) : false })
  reg(`T_HYPNOSIS_${name}`, (ctx2: any) => { const id = getTargetId(ctx2); return id ? getter(getHypnosis(id)) : false })
  reg(`T_NOT_HYPNOSIS_${name}`, (ctx2: any) => { const id = getTargetId(ctx2); return id ? !getter(getHypnosis(id)) : false })
}
regSubState('INCREASE_BODY_SENSITIVITY', h => h.increase_body_sensitivity)
regSubState('FORCE_OVULATION', h => h.force_ovulation)
regSubState('BLOCKHEAD', h => h.blockhead)
regSubState('ACTIVE_H', h => h.active_h)
regSubState('PAIN_AS_PLEASURE', h => h.pain_as_pleasure)
regSubState('ROLEPLAY', h => h.roleplay.length > 0)
```

---

### Task 3: 效果注册

在 `onLoad` 中注册全部 14 个效果：

**核心效果：**
- `hypnosis_one` — 增加 `hypnosis_degree`，检查上限，触发完成检查
- `hypnosis_all` — 对场景中所有非催眠角色执行 `hypnosis_one`
- `hypnosis_cancel` — 重置 `hypnosis_degree=0`，`unconscious_h=0`，所有子状态关闭

**子状态开关效果（每个类似）：**
```typescript
effectTypeRegistry.register('hypnosis_increase_body_sensitivity_on', (_p: any, execCtx: any) => {
  for (const id of execCtx._targetIds as string[]) getHypnosis(id).increase_body_sensitivity = true
  return true
})
effectTypeRegistry.register('hypnosis_increase_body_sensitivity_off', (_p: any, execCtx: any) => {
  for (const id of execCtx._targetIds as string[]) getHypnosis(id).increase_body_sensitivity = false
  return true
})
// 同理: force_ovulation, blockhead, active_h, pain_as_pleasure 的 on/off
```

**特殊效果：**
- `hypnosis_force_climax` — 调用 h-core 的强制绝顶 API（erArk 1223）
- `hypnosis_blockhead_switch` — 切换木头人开关（erArk 1226）
- `hypnosis_blockhead_off` — 关闭木头人（erArk 1227）
- `hypnosis_active_h_switch` — 切换逆推 + 触发 H（erArk 1228）
- `hypnosis_active_h_off` — 关闭逆推（erArk 1229）
- `hypnosis_pain_as_pleasure_switch` — 切换苦痛快感化（erArk 1230）
- `hypnosis_pain_as_pleasure_off` — 关闭苦痛快感化（erArk 1231）

---

### Task 4: 核心公式

添加以下函数到模块级：

```typescript
// 催眠程度增长 - erArk hypnosis_panel.py:42-86
function calculateHypnosisDegree(charId: string): number {
  const target = entitySystem.get('character', charId) as any
  if (!target) return 0
  const type = lastHypnosisType
  let baseCoeff = 2
  if (type === 2) baseCoeff = 4      // 空气催眠
  else if (type >= 3) baseCoeff = 6  // 体控/心控
  // TODO: 调香加成 (aromatherapy == 6 → +5)
  const markLv = target?.abilities?.['无觉刻印']?.level ?? 0
  const abilityAdj = getAbilityAdjust(markLv)
  const adjust = baseCoeff * abilityAdj
  const rand = 0.5 + Math.random()   // random(0.5, 1.5)
  return Math.round(1 * adjust * rand * 10) / 10
}

// getAbilityAdjust 表（与 h-hidden/h-bondage 共享）
function getAbilityAdjust(lv: number): number {
  const tbl = [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
  return tbl[Math.min(Math.max(0, lv), 10)] ?? 4.0
}

// 理智消耗 - erArk hypnosis_panel.py:23-40
function calculateSanityCost(charId: string): number {
  const target = entitySystem.get('character', charId) as any
  if (!target) return 20
  const t = target.talent ?? {}
  if (t[73]) return 1    // 被完全催眠
  if (t[72]) return 30   // 被深度催眠
  if (t[71]) return 25   // 被初级催眠
  return 20               // 无
}

// 程度上限 - erArk hypnosis_panel.py:88-105
function getHypnosisDegreeLimit(): number {
  // TODO: 基于玩家最高催眠天赋
  // 331→50, 332→100, 333→100, 334→200
  return 200
}

// 完成检查 - erArk hypnosis_panel.py:107-158
function checkHypnosisCompletion(charId: string): boolean {
  const h = getHypnosis(charId)
  if (h.hypnosis_degree < 50) return false  // 最低阈值
  // TODO: 检查 NPC 天赋阈值 + 触发二段行为
  return false
}
```

---

### Task 5: 公式集成钩子

添加集成函数：

```typescript
// 敏感度提升 - erArk common_default.py:304
function applySensitivityBonus(charId: string, baseAdjust: number): number {
  return getHypnosis(charId).increase_body_sensitivity ? baseAdjust + 2 : baseAdjust
}

// 苦痛快感化 - erArk common_default.py:243
function applyPainAsPleasure(charId: string, stateId: number): number {
  return (stateId === 17 && getHypnosis(charId).pain_as_pleasure) ? 23 : stateId
}

// 空气催眠 - 好感和信赖归零
function applyAirHypnosisTrustMod(charId: string, trustGain: number): number {
  const u = getUnconsciousH(charId)
  return u === 5 ? 0 : trustGain
}

// 催眠姦经验
function applyHypnosisSexExp(charId: string): void {
  const u = getUnconsciousH(charId)
  if (u < 4 || u > 7) return
  const ch = entitySystem.get('character', charId) as any
  if (!ch) return
  if (!ch.experience) ch.experience = {}
  ch.experience['hypnosis_rape'] = (ch.experience['hypnosis_rape'] ?? 0) + 1
}
```

---

### Task 6: 事件监听 + UI + 最终验证

在 `onEnable` 中注册：
```typescript
// 注册 API
ctx.api.register('h-hypnosis', {
  getDegree: (charId: string) => getHypnosis(charId).hypnosis_degree,
  getType: () => lastHypnosisType,
  isHypnotized: (charId: string) => { const u = getUnconsciousH(charId); return u >= 4 && u <= 7 },
  getTypeName: (charId: string) => HYPNOSIS_TYPE_NAMES[getUnconsciousH(charId) >= 4 && getUnconsciousH(charId) <= 7 ? getUnconsciousH(charId) - 3 : 0] ?? '无',
})

// 注册 UI 插槽
try {
  ctx.ui.registerSlot('character-tag', {
    id: 'hypnosis-tag',
    component: 'HypnosisTag' as any,
    priority: 40,
    condition: (gc: any) => gc?.selectedCharacterId ? (getUnconsciousH(gc.selectedCharacterId) >= 4 && getUnconsciousH(gc.selectedCharacterId) <= 7) : false,
  })
} catch {}

// 验证
npm run typecheck
npm run test  // 230+ 通过
```

TODO 最终检查：
- 天赋前提（PRIMARY/INTERMEDIATE/ADVANCED/SPECIAL_HYPNOSIS）当前返回 `true`，需天赋系统就绪后接入
- 调香加成（aromatherapy == 6）依赖香薰系统
- 催眠完成检查（NPC 天赋获取 + 二段行为）依赖 NPC 天赋系统
- 角色扮演系统（第二阶段）
