# 道具/物品系统复刻实施计划（2026-08-12）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完整复刻 erArk 道具/物品系统——schema 定稿、目录化数据组织、消耗语义（占用/归还）、use 注册与校验、礼物基础版。

**Architecture:** 三层分离下物品数据两级落位：H 系统依赖批（药物/玩具/避孕套）为"原生通用"→ plugins 层 `h-core/data/default/items/` 默认数据；世界观物品（武器/服装/秘籍等）→ mod `definitions/items/` 目录，单文件 `items.toml` 兼容。机制绑定槽位不绑定物品名（erArk 同构）。消耗语义：装槽=占用（背包-1），manual/h_end 卸下归还（+1），expiry/射精/即时药不归还；非消耗品 `consume = false`。

**Tech Stack:** TypeScript、Vitest、TOML（@iarna/toml）、Vite `import.meta.glob`

## Global Constraints

- **三层铁律**：`src/core/` 不得出现具体玩法名词；插件之间禁止直接 import；跨插件通信走 `ctx.api.call()` / 事件总线 / effectTypeRegistry
- **属性名禁止硬编码**：插件代码中禁止出现中文属性名，读写字面属性走 `getEntityAttr`/`ATTR` 或绑定系统
- **物品 schema**（grill 定稿）：`id`（中文，全局唯一）/`name`/`type`（consumable|equipment|tool|material|key 五枚举）/`use`（数组，self/target/equip/gift/key/h_drug/h_toy/h_special，可扩展）/`tags`（自由数组，不校验）/`stackable`/`consume`（boolean 默认 true）/`effects`/`description`/`price`/`level`/`time_cost`（数字可选）+ H 专属：`body_slot`（≥0 槽位号，-1 即时药）/`body_auto_remove`（manual|h_end|expiry，**body_slot≥0 时必填**）/`duration`/`tick_base`/`tick_part` + 装备加值可选：`attack_bonus`/`defense_bonus`（顶层数字，引擎不认识语义）
- **消耗语义**（grill 定案）：装槽=占用（背包-1）；manual/h_end 卸下归还背包（+1）；expiry 到期/避孕套射精消耗/即时药（body_slot=-1）不归还；`consume=false` 物品使用不扣数量；`consume=true`（默认）使用后扣 1
- **body_item 槽位自由扩展**：`body_items` 是自由 key 字典，无固定槽位表；erArk 兼容快捷前提（VIBRATOR 等）保留硬编码槽位号；参数化前提 `HAS_BODY_ITEM`/`TARGET_HAS_BODY_ITEM` 已支持
- **目录组织**：mod 物品 = `definitions/items/*.toml`（类别文件，单文件 `items.toml` 兼容）；插件默认 = `src/plugins/*/data/default/items/*.toml`；跨 mod 文件同 id 重复 → error（文件名+行号）；插件默认与 mod 覆盖合法（deepMerge，mod 优先）
- **校验**（grill 定案）：跨文件 id 重复 error；`body_slot≥0` 无 `body_auto_remove` error；`use` 未注册 warning（不影响加载）；`consume`/`price`/`level`/`time_cost` 类型校验；`tags` 不校验
- **礼物基础版**：`give_gift` effect（h-core 注册），mode=favor（走 `calcFavorability` + `calcTrust` 管线，话术能力修正）/apology（愤怒清零+好感+10+好意+10）/drug（物品 effects 表达）/mold → TODO（不实装）
- **测试**：Vitest；数值断言（复刻要求，参考 `docs/skills/replicating-an-instruction.md`）；`npm run typecheck && npm run test` 全绿
- **本次不做**（写 TODO 注释，不假装实现）：商店/交易指令、采集/掉落管线、倒模礼物（type 13）、咖啡加料
- **删除范围**（用户确认）：test-mod 仅删 4 个武侠失误物品（healing_potion/iron_sword/leather_armor/herb）；服装（布衣/长裤/浴衣/睡衣/泳装/裙子/情趣内衣/项链）与绳子**保留**（premise-clothing / h-bondage 测试依赖）

---

### Task 1: mod-loader items 目录拆分 + 跨文件 id 重复校验

**Files:**
- Modify: `src/core/mod-loader.ts:1152-1157`（items 加载段 → loadItemDefs 函数）
- Modify: `src/core/mod-loader.test.ts`（新增 describe）

**Interfaces:**
- Consumes: `parseModData(modName, rawTomlMap)`、`rawTomlMap`（已含 `/src/plugins/*/data/default/**/*.toml` 与 `/mods/${modName}/**`）、`errorReporter.report`
- Produces: `mod.items: Record<string, ItemDef>` —— 插件默认 + mod 深合并；`ItemDef` 类型扩展（见 Task 5，本任务只加校验字段不强制）

- [ ] **Step 1: 写失败测试**——`src/core/mod-loader.test.ts` 新增 describe「item storage（目录拆分）」，复制 `makeMap` 用法：

```ts
// ═══════ 物品存储（2026-08-12：目录拆分 + 插件默认 + 重复校验）═══════
describe('item storage（目录拆分 + 覆盖 + 重复校验）', () => {
  it('definitions/items/ 目录拆分合并 + 单文件兼容 + 插件默认覆盖', () => {
    const mod = parseModData('test-mod', makeMap({
      '/src/plugins/h-core/data/default/items/h-drugs.toml': [
        '[items]',
        '[items."媚药"]',
        'name = "媚药"',
        'type = "consumable"',
        'use = ["h_drug"]',
        'body_slot = -1',
        'price = 100',
      ].join('\n'),
      '/mods/test-mod/definitions/items/drugs.toml': [
        '[items]',
        '[items."金疮药"]',
        'name = "金疮药"',
        'type = "consumable"',
        'use = ["self"]',
        'effects = [{ type = "modify_attribute", params = { attr = "hp", value = 20, target = "self" } }]',
      ].join('\n'),
      '/mods/test-mod/definitions/items/misc.toml': [
        '[items]',
        '[items."江湖令"]',
        'name = "江湖令"',
        'type = "key"',
        'use = []',
      ].join('\n'),
    }))
    expect(mod.items['金疮药']).toBeDefined()   // 目录文件 1
    expect(mod.items['江湖令']).toBeDefined()   // 目录文件 2
    expect(mod.items['媚药']).toBeDefined()     // 插件默认
    expect(mod.items['媚药'].price).toBe(100)
    // 单文件 items.toml 兼容（test-mod items.toml 现有物品）
    expect(mod.items['布衣']).toBeDefined()
  })

  it('mod 覆盖插件默认：同 id 深合并 mod 优先', () => {
    const mod = parseModData('test-mod', makeMap({
      '/src/plugins/h-core/data/default/items/h-drugs.toml': [
        '[items]',
        '[items."媚药"]',
        'name = "媚药"',
        'type = "consumable"',
        'price = 100',
      ].join('\n'),
      '/mods/test-mod/definitions/items/drugs.toml': [
        '[items]',
        '[items."媚药"]',
        'name = "媚药"',
        'price = 200',
      ].join('\n'),
    }))
    expect(mod.items['媚药'].price).toBe(200)
  })

  it('mod 文件间同 id 重复 → error 上报', () => {
    errorReporter.clear()
    parseModData('test-mod', makeMap({
      '/mods/test-mod/definitions/items/drugs.toml': [
        '[items]',
        '[items."金疮药"]',
        'name = "金疮药"',
        'type = "consumable"',
      ].join('\n'),
      '/mods/test-mod/definitions/items/food.toml': [
        '[items]',
        '[items."金疮药"]',
        'name = "金疮药"',
        'type = "consumable"',
      ].join('\n'),
    }))
    const err = errorReporter.getErrors().find(e => e.severity === 'error' && e.message.includes('金疮药') && e.message.includes('重复'))
    expect(err).toBeDefined()
  })
})
```

- [ ] **Step 2: 运行确认失败**——`npx vitest run src/core/mod-loader.test.ts -t "item storage"`
  Expected: 失败（mod.items 未含目录文件物品 / 无重复报错）

- [ ] **Step 3: 实现**——替换 `mod-loader.ts:1152-1157`：

```ts
  // 注释：加载 items——单文件 items.toml（插件默认 + mod definitions）+ 目录拆分
  // definitions/items/*.toml 与 data/default/items/*.toml（2026-08-12：物品按类别分文件）；
  // 合并规则：插件默认先合并（同 id 覆盖合法），mod 文件间同 id 重复 → error（文件名+行号）
  function loadItemDefs(): Record<string, ItemDef> {
    let result: Record<string, ItemDef> = {}
    const isItemFile = (path: string) =>
      path.endsWith('/items.toml')
      || path.includes('/definitions/items/')
      || path.includes('/data/default/items/')
    const mergeInto = (path: string, raw: string, checkDuplicate: boolean) => {
      const data = parseFile(path, raw)
      const items = (data as any).items as Record<string, ItemDef> | undefined
      if (!items) return
      for (const [id, def] of Object.entries(items)) {
        if (!def || typeof def !== 'object') continue
        if (checkDuplicate && id in result) {
          errorReporter.report({
            source: 'mod-loader',
            severity: 'error',
            message: `物品 '${id}' 重复定义（${path}）——物品 id 必须在整个模组内唯一`,
            suggestion: '检查 definitions/items/ 下多个文件是否定义了同名物品，合并或改名',
          })
          continue
        }
        result[id] = deepMerge(result[id] ?? {}, def)
      }
    }
    // 插件默认层（data/default/items/*.toml + 插件内 items.toml）——同 id 覆盖合法
    for (const [path, raw] of Object.entries(rawTomlMap)) {
      if (!path.startsWith('/src/plugins/')) continue
      if (!isItemFile(path)) continue
      mergeInto(path, raw, false)
    }
    // mod 层（definitions/items.toml + definitions/items/*.toml）——文件间重复 error
    for (const [path, raw] of Object.entries(rawTomlMap)) {
      if (!path.startsWith(`/mods/${modName}/`)) continue
      if (!isItemFile(path)) continue
      mergeInto(path, raw, true)
    }
    return result
  }
  mod.items = loadItemDefs()
```

- [ ] **Step 4: 运行确认通过**——`npx vitest run src/core/mod-loader.test.ts`
  Expected: 全绿（含既有测试）

- [ ] **Step 5: 提交**——`git add src/core/mod-loader.ts src/core/mod-loader.test.ts && git commit -m "feat(item): items 目录拆分加载 + 跨文件 id 重复校验（Task 1）"`

---

### Task 2: inventory-system 完善——useItem 扣减 + consume + removeItem 返回 boolean

**Files:**
- Modify: `src/plugins/inventory-system/index.ts`
- Create: `src/plugins/inventory-system/index.test.ts`

**Interfaces:**
- Consumes: `apiSystem.call('effect-system', 'execute', ...)`、`modLoader.getMod()?.items`、`errorReporter`、`eventBus`
- Produces:
  - `removeItem(charId, itemId, count): boolean` —— 成功移除返回 true；物品不存在/数量不足/角色不存在返回 false（**h-core body_item_equip 的"半成品注记"（index.ts:734-736）依赖此修复**）
  - `useItem(charId, itemId, targetId?): Promise<boolean>` —— 物品定义不存在 → false；`consume` 默认 true → 先扣 1（removeItem 失败即数量不足 → 不执行 effects 返回 false），再执行 effects；`consume=false` → 只执行 effects；effects 执行后 emit `item:used`；targetId 提供时 `_targetIds = [targetId]`，否则 `[charId]`

- [ ] **Step 1: 写失败测试**——`src/plugins/inventory-system/index.test.ts`（setup 参考 `src/plugins/follow-system.test.ts:40-80`：`entitySystem.clear()` + `await modLoader.loadMod('test-mod')` + `bindingResolver.loadBindings` + `PluginManager` 全量加载插件）：

```ts
// 注释：inventory-system 测试——useItem 消耗语义（2026-08-12 Task 2）
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { modLoader } from '../../core/mod-loader'
import { entitySystem } from '../../core/entity-system'
import { apiSystem } from '../../core/api'
import { eventBus } from '../../core/event-bus'
import { bindingResolver } from '../../core/binding-resolver'
import { PluginManager } from '../../core/plugin-manager'
import { SlotRegistry } from '../../ui/slots/slot-registry'
import { commandRegistry } from '../../core/command-registry'
import { errorReporter } from '../../core/error-reporter'

async function bootPlugins() {
  const pluginManager = new PluginManager(apiSystem, eventBus, new SlotRegistry(), commandRegistry)
  const pluginModules = import.meta.glob('/src/plugins/*/index.ts', { eager: true }) as Record<string, any>
  const pluginTomls = import.meta.glob('/src/plugins/*/plugin.toml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const enginePlugins = new Map<string, { toml: string; module?: any }>()
  for (const [path, toml] of Object.entries(pluginTomls)) {
    const dirName = path.match(/\/src\/plugins\/([^/]+)\//)?.[1]
    if (!dirName) continue
    enginePlugins.set(dirName, { toml, module: pluginModules[`/src/plugins/${dirName}/index.ts`] ?? undefined })
  }
  await pluginManager.loadPlugins(enginePlugins, new Map())
}

describe('inventory-system 消耗语义', () => {
  beforeAll(async () => {
    entitySystem.clear()
    errorReporter.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    bindingResolver.loadBindings(mod.bindings)
    await bootPlugins()
  })

  function makeChar(id: string, inventory: { itemId: string; count: number }[] = []) {
    const ch = entitySystem.register('character', id, { name: id, inventory }) as any
    return ch
  }

  it('useItem 消耗品：先扣 1 再执行 effects（现有 bug：useItem 不扣数量）', async () => {
    makeChar('u1', [{ itemId: '回血丹', count: 2 }])
    const before = (entitySystem.get('character', 'u1') as any).base?.hp ?? 100
    await apiSystem.call('inventory', 'useItem', 'u1', '回血丹')
    const ch = entitySystem.get('character', 'u1') as any
    expect(ch.inventory.find((i: any) => i.itemId === '回血丹').count).toBe(1)
    expect(ch.base.hp).toBeGreaterThan(before)
  })

  it('useItem 数量不足：不执行 effects 返回 false', async () => {
    makeChar('u2', [{ itemId: '回血丹', count: 1 }])
    const ch = entitySystem.get('character', 'u2') as any
    ch.base.hp = 100
    const ok = await apiSystem.call('inventory', 'useItem', 'u2', '回血丹')
    expect(ok).toBe(false) // 数量不足：效果不执行（hp 不变）
    expect(ch.base.hp).toBe(100)
    expect(ch.inventory.find((i: any) => i.itemId === '回血丹')).toBeUndefined()
  })

  it('removeItem 返回 boolean：缺物品返回 false（h-core body_item_equip 半成品注记依赖）', async () => {
    makeChar('u3', [])
    expect(await apiSystem.call('inventory', 'removeItem', 'u3', '媚药', 1)).toBe(false)
    makeChar('u4', [{ itemId: '媚药', count: 2 }])
    expect(await apiSystem.call('inventory', 'removeItem', 'u4', '媚药', 1)).toBe(true)
    expect((entitySystem.get('character', 'u4') as any).inventory.find((i: any) => i.itemId === '媚药').count).toBe(1)
  })

  it('useItem 带 targetId：effects 的 _targetIds 用目标', async () => {
    makeChar('u5', [{ itemId: '回血丹', count: 1 }])
    makeChar('u6', [])
    // 回血丹 effects 显式 target="self"——此处只验证扣减与事件，_targetIds 行为由 h_drug 指令覆盖
    await apiSystem.call('inventory', 'useItem', 'u5', '回血丹', 'u6')
    const ch = entitySystem.get('character', 'u5') as any
    expect(ch.inventory).toHaveLength(0)
  })
})
```

注意：`makeChar` 需处理 `回血丹` 在 test-mod items 中的效果（modify_attribute hp）。若 test-mod items.toml 在 Task 4 前仍是英文 id（healing_potion），则测试用 `healing_potion`；Task 4 迁移后统一中文 id。**以执行时 test-mod 实际物品名为准**——执行前先 `grep 回血丹|healing_potion mods/test-mod/definitions/items.toml` 确认。

- [ ] **Step 2: 运行确认失败**——`npx vitest run src/plugins/inventory-system/index.test.ts`
  Expected: 失败（useItem 不扣数量）

- [ ] **Step 3: 实现**——`src/plugins/inventory-system/index.ts`：

```ts
    removeItem: (charId: string, itemId: string, count: number = 1): boolean => {
      const char = entitySystem.get('character', charId) as any
      if (!char?.inventory) return false
      const existing = char.inventory.find((i: any) => i.itemId === itemId)
      if (!existing || existing.count < count) return false
      existing.count -= count
      if (existing.count <= 0) {
        char.inventory = char.inventory.filter((i: any) => i.itemId !== itemId)
      }
      eventBus.emit('item:removed', { character: charId, itemId, count })
      return true
    },
    useItem: async (charId: string, itemId: string, targetId?: string): Promise<boolean> => {
      const mod = modLoader.getMod()
      const itemDef = mod?.items[itemId]
      if (!itemDef) {
        errorReporter.report({
          source: 'inventory-system',
          severity: 'warning',
          message: `物品 '${itemId}' 不存在`,
        })
        return false
      }
      // 注释：消耗语义（grill 定案）——consume 默认 true：先扣 1（数量不足则不执行效果）
      const consume = itemDef.consume !== false
      if (consume) {
        const removed = apiSystem.call('inventory', 'removeItem', charId, itemId, 1) as unknown as boolean
        if (!removed) return false
      }
      // 注释：执行物品定义的 effects（effect-system）；targetId 优先（h_drug 给目标用药等）
      if (itemDef.effects) {
        await apiSystem.call('effect-system', 'execute', itemDef.effects, {
          sourceId: charId,
          _targetIds: [targetId ?? charId],
        })
      }
      eventBus.emit('item:used', { character: charId, itemId, targetId })
      return true
    },
```

注意：`apiSystem.call` 返回 Promise，removeItem 同步 boolean 会被包一层——保持现有调用风格（`apiSystem.call('inventory','removeItem',...)` 直接调用即可拿到返回值；上面代码里 `as unknown as boolean` 仅为类型标注，实际值为 Promise<boolean>，需要 await）。**实现时用 `const removed = await apiSystem.call(...)`**。

- [ ] **Step 4: 运行确认通过**——`npx vitest run src/plugins/inventory-system/index.test.ts src/plugins/h-core`
  Expected: 全绿（h-core body_item_equip 依赖 removeItem——确认无回归）

- [ ] **Step 5: 提交**——`git add src/plugins/inventory-system && git commit -m "feat(item): useItem 消耗语义（consume 扣减/数量不足拦截）+ removeItem 返回 boolean（Task 2）"`

---

### Task 3: h-core body_item 归还语义

**Files:**
- Modify: `src/plugins/h-core/index.ts`（`body_item_unequip` 约 759-769；H 结束清理 1068-1079）

**Interfaces:**
- Consumes: `apiSystem.call('inventory', 'addItem', ...)`、`apiSystem.call('inventory', 'removeItem', ...)`（Task 2 返回 boolean）
- Produces: 归还语义 —— `body_item_unequip` 卸下 → 物品回背包（+1）；H 结束清理 `body_auto_remove=h_end` → 回背包（+1）；`expiry` 到期与射精消耗（h-ejaculation）**不**回背包（不动）

- [ ] **Step 1: 写失败测试**——追加到 `src/plugins/h-core/index.test.ts`（若不存在则新建，setup 同 Task 2 bootPlugins 模式；`body_item_equip` 需要物品定义与背包物品）：

```ts
// 注释：body_item 归还语义（2026-08-12 Task 3，grill Q4 定案）
describe('body_item 归还语义', () => {
  function charWithToy(id: string) {
    const ch = entitySystem.get('character', id) as any
    if (!ch) return
    ch.inventory = [{ itemId: '乳头夹', count: 2 }]
    ch.body_items = {}
  }

  it('装槽占用：body_item_equip 扣背包 1，物品进槽', async () => {
    charWithToy('toy1')
    await apiSystem.call('effect-system', 'execute', [
      { type: 'body_item_equip', params: { slot: 0 } },
    ], { sourceId: 'toy1', _itemId: '乳头夹', _targetIds: ['toy1'] })
    const ch = entitySystem.get('character', 'toy1') as any
    expect(ch.inventory.find((i: any) => i.itemId === '乳头夹').count).toBe(1)
    expect(ch.body_items['0'].itemId).toBe('乳头夹')
  })

  it('手动卸下归还：body_item_unequip → 背包 +1，槽清空', async () => {
    charWithToy('toy2')
    await apiSystem.call('effect-system', 'execute', [
      { type: 'body_item_equip', params: { slot: 0 } },
    ], { sourceId: 'toy2', _itemId: '乳头夹', _targetIds: ['toy2'] })
    await apiSystem.call('effect-system', 'execute', [
      { type: 'body_item_unequip', params: { slot: 0 } },
    ], { sourceId: 'toy2', _targetIds: ['toy2'] })
    const ch = entitySystem.get('character', 'toy2') as any
    expect(ch.body_items['0']).toBeUndefined()
    expect(ch.inventory.find((i: any) => i.itemId === '乳头夹').count).toBe(2)
  })

  it('H 结束清理 h_end 玩具 → 回背包（挤奶器）', async () => {
    const ch = entitySystem.get('character', 'toy3') as any
    if (!ch) return
    ch.inventory = [{ itemId: '挤奶器', count: 1 }]
    ch.body_items = { '4': { itemId: '挤奶器', active: true } }
    ch.h_state = { is_h: true, insert_position: -1 }
    // 触发 endHScene——通过事件或直接调用？用 do_h/end_h 指令全链路太重；
    // 直接调用 h-core 导出的 endHScene（若导出）或发 h:end 事件前找入口
    // TODO 执行时确认 endHScene 导出与调用方式（index.ts 约 995-1095 endHScene）
  })
})
```

⚠️ **执行时注意**：第三测试（H 结束）若 `endHScene` 未从 h-core 导出，改为：调用指令链 `commandRegistry.getById('end_h')` 的 handler（bootPlugins 后 h-core 已注册 end_h 指令，参考 `docs/instruction-replication/migration-workflow.md` 中指令调用方式），或用 h-core 测试既有模式。**以 h-core 现有测试如何驱动 H 生命周期为准**（先 `glob src/plugins/h-core/*.test.ts` 看先例）。

- [ ] **Step 2: 运行确认失败**——`npx vitest run src/plugins/h-core -t "body_item 归还"`
  Expected: 失败（unequip 不回背包）

- [ ] **Step 3: 实现**——`src/plugins/h-core/index.ts`：

`body_item_unequip`（759-769 附近）改为：

```ts
  // 注释：body_item_unequip——卸下身体物品（grill Q4：manual/h_end 卸下归还背包 +1）
  effectTypeRegistry.register('body_item_unequip', async (_p: any, execCtx: any) => {
    const slot = (_p.slot as number) ?? -1
    if (slot < 0) return true
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.body_items) continue
      const slotData = ch.body_items[String(slot)] as BodyItemSlot | undefined
      delete ch.body_items[String(slot)]
      if (slotData?.itemId) {
        await apiSystem.call('inventory', 'addItem', id, slotData.itemId, 1)
      }
      eventBus.emit('character:changed', { id })
    }
    return true
  })
```

H 结束清理（1068-1079 附近）改为：

```ts
      // 注释：H 结束自动清理 body_auto_remove=h_end 的 body_item（grill Q4：归还背包 +1）
      if (c.body_items) {
        const mod = modLoader.getMod()
        for (const [slotKey, slotData] of Object.entries(c.body_items) as [string, any][]) {
          const sd = slotData as BodyItemSlot
          if (sd.active) {
            const itemDef = (mod?.items as any)?.[sd.itemId] as any
            if (itemDef?.body_auto_remove === 'h_end') {
              delete c.body_items[slotKey]
              if (sd.itemId) {
                await apiSystem.call('inventory', 'addItem', c.id, sd.itemId, 1)
              }
            }
          }
        }
      }
```

（`endHScene` 是 async 函数，内部已有多处 await——在循环里加 await 合法。）

- [ ] **Step 4: 运行确认通过**——`npx vitest run src/plugins/h-core src/plugins/h-ejaculation src/plugins/h-npc-ai`
  Expected: 全绿（h_ejaculation 避孕套射精清槽逻辑不受影响——它清除的是槽 13，不经过归还；但需确认其用 `body_item_unequip` 还是直接 delete，若用 unequip 则避孕套会被加回背包——**违反 Q4 定案（射精消耗不回背包）**。执行时检查 `src/plugins/h-ejaculation/index.ts` 射精清槽写法，如走 unequip 则改为直接 delete + 注释说明）

- [ ] **Step 5: 提交**——`git add src/plugins/h-core/index.ts && git commit -m "feat(item): body_item 归还语义（手动卸下/H结束回背包，expiry/射精不归还）（Task 3）"`

---

### Task 4: 物品数据迁移（H 物品 → h-core 默认数据，删武侠失误物品）

**Files:**
- Create: `src/plugins/h-core/data/default/items/h-drugs.toml`
- Create: `src/plugins/h-core/data/default/items/h-toys.toml`
- Create: `src/plugins/h-core/data/default/items/h-special.toml`
- Modify: `mods/test-mod/definitions/items.toml`（删 H 物品 + 删 4 个武侠物品）
- Modify: `src/plugins/inventory-system/index.ts`（gather 指令 herb 引用）

**Interfaces:**
- Consumes: Task 1 的目录拆分加载（`data/default/items/*.toml` 已被 glob 覆盖：`mod-loader.ts:1779`）
- Produces: test-mod 物品 = 服装（布衣/长裤/浴衣/睡衣/泳装/裙子/情趣内衣/项链）+ 绳子 + 新增测试消耗品 `回血丹`（补上被删 healing_potion 的测试缺口，供 Task 2/6 测试用）

- [ ] **Step 1: 先确认现状引用**——`grep -r "healing_potion\|iron_sword\|leather_armor\|'herb'\|回血丹" src/ --include="*.ts"`（确认 gather 之外无引用）
  Expected: 仅 `src/plugins/inventory-system/index.ts:120` 一处 herb 引用

- [ ] **Step 2: 新建 h-core 默认物品数据**：

`src/plugins/h-core/data/default/items/h-drugs.toml`：
```toml
# 注释：H 原生药物（grill Q1：原生通用 = H 系统依赖批，plugins 层默认数据，mod 可 override）
# 数值来源：复刻攻略-猥亵-H系统专用/03-道具系统.md（erArk Item ID 100-108 公式逐条核对）
[items."润滑液"]
name = "润滑液"
type = "consumable"
use = ["h_drug"]
tags = ["drug", "h_drug"]
stackable = true
consume = true
body_slot = -1
effects = [{ type = "apply_lubricant", params = { target = "selected" } }]

[items."媚药"]
name = "媚药"
type = "consumable"
use = ["h_drug"]
tags = ["drug", "h_drug"]
stackable = true
consume = true
body_slot = -1
effects = [{ type = "apply_aphrodisiac", params = { target = "selected" } }]

[items."跳蛋"]
name = "跳蛋"
type = "consumable"
use = ["h_drug"]
tags = ["toy", "h_drug"]
stackable = true
consume = true
body_slot = -1
effects = [{ type = "apply_instant_toy", params = { target = "selected", part = "clit", base = 50 } }]

[items."灌肠液"]
name = "灌肠液"
type = "consumable"
use = ["h_drug"]
tags = ["drug", "h_drug"]
stackable = true
consume = true
body_slot = -1
effects = []

[items."利尿剂"]
name = "利尿剂"
type = "consumable"
use = ["h_drug"]
tags = ["drug", "h_drug"]
stackable = true
consume = true
body_slot = -1
effects = []

[items."安眠药"]
name = "安眠药"
type = "consumable"
use = ["h_drug"]
tags = ["drug", "h_drug"]
stackable = true
consume = true
body_slot = 9
body_auto_remove = "expiry"
duration = 480
effects = [{ type = "body_item_equip", params = { slot = 9 } }]

[items."排卵促进药"]
name = "排卵促进药"
type = "consumable"
use = ["h_drug"]
tags = ["drug", "h_drug"]
stackable = true
consume = true
body_slot = 10
body_auto_remove = "manual"
effects = [{ type = "body_item_equip", params = { slot = 10 } }]

[items."事前避孕药"]
name = "事前避孕药"
type = "consumable"
use = ["h_drug"]
tags = ["drug", "h_drug"]
stackable = true
consume = true
body_slot = 11
body_auto_remove = "expiry"
duration = 43200
effects = [{ type = "body_item_equip", params = { slot = 11 } }]

[items."事后避孕药"]
name = "事后避孕药"
type = "consumable"
use = ["h_drug"]
tags = ["drug", "h_drug"]
stackable = true
consume = true
body_slot = 12
body_auto_remove = "manual"
effects = [{ type = "body_item_equip", params = { slot = 12 } }]
```

`src/plugins/h-core/data/default/items/h-toys.toml`：
```toml
# 注释：H 原生玩具（grill Q1/Q4：装槽=占用，manual/h_end 卸下归还背包）
[items."乳头夹"]
name = "乳头夹"
type = "equipment"
use = ["h_toy"]
tags = ["toy", "h_toy"]
stackable = false
consume = true
body_slot = 0
body_auto_remove = "manual"
tick_base = 20
tick_part = { ability = "B感觉", params = ["胸部"] }
effects = [{ type = "body_item_equip", params = { slot = 0 } }]

[items."阴蒂夹"]
name = "阴蒂夹"
type = "equipment"
use = ["h_toy"]
tags = ["toy", "h_toy"]
stackable = false
consume = true
body_slot = 1
body_auto_remove = "manual"
tick_base = 20
tick_part = { ability = "C感觉", params = ["阴蒂"] }
effects = [{ type = "body_item_equip", params = { slot = 1 } }]

[items."V震动棒"]
name = "V震动棒"
type = "equipment"
use = ["h_toy"]
tags = ["toy", "h_toy"]
stackable = false
consume = true
body_slot = 2
body_auto_remove = "manual"
tick_base = 20
tick_part = { ability = "V感觉", params = ["阴道"] }
effects = [{ type = "body_item_equip", params = { slot = 2 } }]

[items."A震动棒"]
name = "A震动棒"
type = "equipment"
use = ["h_toy"]
tags = ["toy", "h_toy"]
stackable = false
consume = true
body_slot = 3
body_auto_remove = "manual"
tick_base = 20
tick_part = { ability = "A感觉", params = ["后穴"] }
effects = [{ type = "body_item_equip", params = { slot = 3 } }]

[items."挤奶器"]
name = "挤奶器"
type = "equipment"
use = ["h_toy"]
tags = ["toy", "h_toy"]
stackable = false
consume = true
body_slot = 4
body_auto_remove = "h_end"
tick_base = 20
tick_part = { ability = "B感觉", params = ["胸部"] }
effects = [{ type = "body_item_equip", params = { slot = 4 } }]

[items."眼罩"]
name = "眼罩"
type = "equipment"
use = ["h_toy"]
tags = ["toy", "h_toy"]
stackable = false
consume = true
body_slot = 6
body_auto_remove = "h_end"
effects = [{ type = "body_item_equip", params = { slot = 6 } }]

[items."肛门拉珠"]
name = "肛门拉珠"
type = "equipment"
use = ["h_toy"]
tags = ["toy", "h_toy"]
stackable = false
consume = true
body_slot = 7
body_auto_remove = "h_end"
effects = [{ type = "body_item_equip", params = { slot = 7 } }]

[items."口球"]
name = "口球"
type = "equipment"
use = ["h_toy"]
tags = ["toy", "h_toy"]
stackable = false
consume = true
body_slot = 14
body_auto_remove = "h_end"
effects = [{ type = "body_item_equip", params = { slot = 14 } }]
```

`src/plugins/h-core/data/default/items/h-special.toml`：
```toml
# 注释：H 原生特殊道具（避孕套——grill Q4：射精消耗清槽不回背包，h-ejaculation 消费）
[items."避孕套"]
name = "避孕套"
type = "consumable"
use = ["h_special"]
tags = ["h_special"]
stackable = true
consume = true
body_slot = 13
body_auto_remove = "h_end"
effects = [{ type = "body_item_equip", params = { slot = 13 } }]
```

⚠️ **灌肠液/利尿剂 effects 留空数组 + TODO 注释**（apply 效果未注册则运行时 warning 跳过；或者效果留空不报错——执行时确认：effect-system 对未知 effect type 是加载 warning + 运行时跳过（AGENTS §34），所以可以直接写 `effects = [{ type = "apply_enema", params = {} }]` + TODO 注释。**以不破坏 boot 冒烟为准**——跑 `npx vitest run src/plugins/boot-smoke.test.ts` 验证）。

- [ ] **Step 3: 迁移 test-mod items.toml**——从 `mods/test-mod/definitions/items.toml` 删除：
  - H 药物段（润滑液/媚药/跳蛋/安眠药/排卵促进药/事前避孕药/事后避孕药）——已迁 h-core
  - H 玩具段（乳头夹/阴蒂夹/V震动棒/A震动棒/挤奶器/眼罩/肛门拉珠/口球）——已迁 h-core
  - 避孕套段——已迁 h-core
  - 4 个武侠失误物品（healing_potion/iron_sword/leather_armor/herb）——删除
  - **保留**：服装 8 件（布衣/长裤/浴衣/睡衣/泳装/裙子/情趣内衣/项链）+ 绳子
  - **新增**测试消耗品 `回血丹`（补 healing_potion 被删的测试缺口）：
    ```toml
    [items."回血丹"]
    id = "回血丹"
    name = "回血丹"
    type = "consumable"
    use = ["self"]
    stackable = true
    consume = true
    effects = [{ type = "modify_attribute", params = { attr = "hp", value = 50, target = "self" } }]
    ```
  - 注意：新 schema 下 `id`/`name` 均可用；保留文件原风格（id 字段继续写）

- [ ] **Step 4: 修 gather 指令**——`src/plugins/inventory-system/index.ts:120`：`addItem(charId, 'herb', 1)` → 改为 `addItem(charId, '回血丹', 1)`（并用注释说明 gather 为 TODO 占位，正式采集管线后续规划）

- [ ] **Step 5: 跑全量测试确认无回归**——`npm run test`
  Expected: 全绿。特别注意：
  - `boot-smoke.test.ts`（插件加载不抛错）
  - `mod-loader.test.ts`（`mod.items` 断言——若有测试引用删除的物品则同步修）
  - `character-contract.test.ts`（items 引用）

- [ ] **Step 6: 提交**——`git add src/plugins/h-core/data/default/items mods/test-mod/definitions/items.toml src/plugins/inventory-system/index.ts && git commit -m "feat(item): H 原生物品迁 h-core 默认数据，删武侠失误物品（Task 4）"`

---

### Task 5: use 注册机制 + 物品加载校验

**Files:**
- Create: `src/core/use-registry.ts`
- Modify: `src/core/mod-loader.ts`（loadItemDefs 内校验）
- Modify: `src/core/types.ts`（ItemDef 类型扩展）
- Modify: `src/plugins/h-core/index.ts`（onLoad 注册 h_* use 值）
- Test: `src/core/mod-loader.test.ts` / `src/core/use-registry.test.ts`

**Interfaces:**
- Consumes: Task 1 的 loadItemDefs
- Produces:
  - `useRegistry`（`src/core/use-registry.ts`）：`register(useType: string): void`、`has(useType: string): boolean`、`clear(): void`、`all(): string[]`
  - 引擎内置 use 值：`self`、`target`、`equip`、`gift`、`key`（core 初始化时注册）；h-core onLoad 注册 `h_drug`、`h_toy`、`h_special`
  - 校验规则（grill Q8 定案）：use 未注册 → warning（不影响加载）；`body_slot >= 0` 且无 `body_auto_remove` → error；`consume`/`price`/`level`/`time_cost` 类型错误 → warning

- [ ] **Step 1: 写失败测试**——`src/core/use-registry.test.ts`（简单单元测试注册/查询/clear）+ `mod-loader.test.ts` 追加校验测试：

```ts
// use-registry.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useRegistry } from './use-registry'

describe('useRegistry', () => {
  beforeEach(() => useRegistry.clear())
  it('内置 use 值已注册', () => {
    expect(useRegistry.has('self')).toBe(true)
    expect(useRegistry.has('gift')).toBe(true)
  })
  it('register 后 has 为 true', () => {
    useRegistry.register('learn')
    expect(useRegistry.has('learn')).toBe(true)
  })
})
```

```ts
// mod-loader.test.ts 追加（describe 'item 校验'）
  it('body_slot≥0 无 body_auto_remove → error', () => {
    errorReporter.clear()
    parseModData('test-mod', makeMap({
      '/mods/test-mod/definitions/items/drugs.toml': [
        '[items]',
        '[items."迷魂香"]',
        'name = "迷魂香"',
        'type = "consumable"',
        'use = ["h_drug"]',
        'body_slot = 15',
      ].join('\n'),
    }))
    const err = errorReporter.getErrors().find(e => e.severity === 'error' && e.message.includes('迷魂香') && e.message.includes('body_auto_remove'))
    expect(err).toBeDefined()
  })

  it('use 未注册 → warning 不阻止加载', () => {
    errorReporter.clear()
    const mod = parseModData('test-mod', makeMap({
      '/mods/test-mod/definitions/items/misc.toml': [
        '[items]',
        '[items."不明物品"]',
        'name = "不明物品"',
        'type = "tool"',
        'use = ["some_custom_use"]',
      ].join('\n'),
    }))
    expect(mod.items['不明物品']).toBeDefined()
    const warn = errorReporter.getErrors().find(e => e.severity === 'warning' && e.message.includes('不明物品'))
    expect(warn).toBeDefined()
  })
```

- [ ] **Step 2: 运行确认失败**——`npx vitest run src/core/use-registry.test.ts src/core/mod-loader.test.ts -t "item 校验"`
  Expected: 失败（无 useRegistry / 无校验）

- [ ] **Step 3: 实现**——`src/core/use-registry.ts`：

```ts
// 注释：use 注册表——物品 use 值集合（grill Q8：use 未注册 → warning，宽松不阻止加载）
// 引擎内置 use 值在 engine 初始化时注册；插件 onLoad 用 useRegistry.register() 注册自定义 use

class UseRegistry {
  private uses = new Set<string>()

  register(useType: string): void {
    this.uses.add(useType)
  }

  has(useType: string): boolean {
    return this.uses.has(useType)
  }

  all(): string[] {
    return Array.from(this.uses)
  }

  clear(): void {
    this.uses.clear()
  }
}

export const useRegistry = new UseRegistry()

// 注释：引擎内置 use 值（grill Q2：use 数组化，枚举可扩展）
export const BUILTIN_USE_TYPES = ['self', 'target', 'equip', 'gift', 'key'] as const
```

`src/core/mod-loader.ts` 顶部 import `useRegistry`；loadItemDefs 内 `mergeInto` 末尾加校验：

```ts
      // 注释：物品字段校验（grill Q8 定案）
      if (checkDuplicate) {
        if (typeof def.body_slot === 'number' && def.body_slot >= 0 && !def.body_auto_remove) {
          errorReporter.report({
            source: 'mod-loader',
            severity: 'error',
            message: `物品 '${id}' 缺少 body_auto_remove（${path}）——body_slot≥0 的物品必须声明 manual/h_end/expiry`,
          })
        }
        for (const u of (def.use as string[] | undefined) ?? []) {
          if (!useRegistry.has(u)) {
            errorReporter.report({
              source: 'mod-loader',
              severity: 'warning',
              message: `物品 '${id}' 的 use 值 '${u}' 未注册（${path}）——无默认 UI 入口，请用指令或插件注册`,
            })
          }
        }
        if (def.consume !== undefined && typeof def.consume !== 'boolean') {
          errorReporter.report({ source: 'mod-loader', severity: 'warning', message: `物品 '${id}' 的 consume 必须是 boolean（${path}）` })
        }
        for (const f of ['price', 'level', 'time_cost'] as const) {
          const v = (def as any)[f]
          if (v !== undefined && typeof v !== 'number') {
            errorReporter.report({ source: 'mod-loader', severity: 'warning', message: `物品 '${id}' 的 ${f} 必须是 number（${path}）` })
          }
        }
      }
```

⚠️ `checkDuplicate` 标记在 mod 层才为 true——校验也只在 mod 层做（插件默认数据假设自检合格）。若希望校验对所有层生效，把条件改为独立布尔 `shouldValidate`（`path.startsWith('/mods/')`），**执行时按此实现**。

`src/core/types.ts` 的 `ItemDef` 扩展（找现有定义，追加字段）：

```ts
export interface ItemDef {
  // 已有字段保留（id/name/type/stackable/use/effects/body_slot/body_auto_remove/...）
  // 2026-08-12 schema 定稿新增：
  consume?: boolean          // 默认 true：使用后扣 1；false = 非消耗品
  tags?: string[]            // 弹性分类（drug/alcohol/weapon/...自由扩展）
  price?: number             // erArk 字段：商店后续用
  level?: number             // 等级/品级
  time_cost?: number         // 使用耗时（分钟）
  description?: string       // 描述（erArk info）
  attack_bonus?: number      // 装备加值（消费方插件决定语义）
  defense_bonus?: number
}
```

`src/plugins/h-core/index.ts` onLoad 注册：

```ts
  // 注释：注册 H 物品 use 值（grill Q2/Q8）
  useRegistry.register('h_drug')
  useRegistry.register('h_toy')
  useRegistry.register('h_special')
```

- [ ] **Step 4: 运行确认通过**——`npx vitest run src/core src/plugins/boot-smoke.test.ts`
  Expected: 全绿。⚠️ 若现有 items.toml 数据触发新校验（如 use 值未注册报 warning），检查是数据问题还是注册缺失，按实情修数据（test-mod use 值都在内置集合内则无影响）

- [ ] **Step 5: 提交**——`git add src/core/use-registry.ts src/core/types.ts src/core/mod-loader.ts src/plugins/h-core/index.ts && git commit -m "feat(item): use 注册表 + 物品加载校验（body_auto_remove 必填/use warning/类型校验）（Task 5）"`

---

### Task 6: 礼物基础版（give_gift effect）

**Files:**
- Modify: `src/plugins/h-core/index.ts`（注册 give_gift effect，favorability.ts 管线）
- Modify: `mods/test-mod/definitions/items.toml`（加 2 个测试礼物品：好感礼物/道歉礼物）
- Test: `src/plugins/h-core/index.test.ts`（数值断言）

**Interfaces:**
- Consumes: `calcFavorability(charId, baseValue)`（`src/plugins/h-core/settle/favorability.ts:38`）、`calcTrust`（`settle/trust.ts`）、`getEntityAttr`/`ATTR`（`src/core/entity-utils.ts`）、`entitySystem`
- Produces: `give_gift` effect —— `params: { mode: "favor" | "apology" | "drug", favor_base?: number, trust_base?: number, talk_multiplier?: number, target?: string }`
  - favor：好感 = `calcFavorability(target, favor_base)`（无话术能力 → talk_multiplier 参数透传，由 mod 提供；若有话术能力（hConfig `gift_talk_ability_id`，默认 `话术`）则 `multiplier = talk_multiplier × ability_lv_adjust[话术级]`）；信赖 = `calcTrust(target, trust_base)`（有则加）
  - apology：愤怒（ATTR 映射，属性名 `愤怒`）清零 + 好感度 += 10 + 好意 += 10
  - drug：不处理（药物效果由物品 effects 链直接表达）
  - mold：TODO 注释（不实装）
  - 目标：`params.target` 解析（"selected"/"player"/角色 id），默认 selected；走现有 target 解析模式（参考 effect-system 其他 effect 的 target 处理）
- 测试物品：
  ```toml
  [items."玉佩"]
  id = "玉佩"
  name = "玉佩"
  type = "consumable"
  use = ["gift"]
  tags = ["gift", "jewelry"]
  stackable = false
  consume = true
  effects = [{ type = "give_gift", params = { mode = "favor", favor_base = 30, talk_multiplier = 2, target = "selected" } }]

  [items."道歉信"]
  id = "道歉信"
  name = "道歉信"
  type = "consumable"
  use = ["gift"]
  tags = ["gift"]
  stackable = false
  consume = true
  effects = [{ type = "give_gift", params = { mode = "apology", target = "selected" } }]
  ```

- [ ] **Step 1: 写失败测试**（数值断言，replicating-an-instruction 要求）：

```ts
// 注释：礼物基础版（2026-08-12 Task 6，erArk 22-礼物与咖啡系统.md：1.2 礼物类别/1.3 好感礼物公式）
describe('give_gift 礼物效果', () => {
  function setupGiftChars() {
    const target = entitySystem.get('character', 'gift_target') as any
    if (!target) return
    target.base['好感度'] = 30
    target.base['信赖度'] = 0
    target.base['好意'] = 0
    target.base['愤怒'] = 80
  }

  it('favor 礼物：好感按 calcFavorability 管线增加', async () => {
    setupGiftChars()
    const target = entitySystem.get('character', 'gift_target') as any
    const before = target.base['好感度']
    await apiSystem.call('effect-system', 'execute', [
      { type: 'give_gift', params: { mode: 'favor', favor_base: 30, target: 'selected' } },
    ], { sourceId: 'player', _targetIds: ['gift_target'] })
    // calcFavorability(30) 在无状态修正时为 floor(1.0×30)=30
    expect(target.base['好感度']).toBe(before + 30)
  })

  it('apology 礼物：愤怒清零 + 好感+10 + 好意+10', async () => {
    setupGiftChars()
    const target = entitySystem.get('character', 'gift_target') as any
    await apiSystem.call('effect-system', 'execute', [
      { type: 'give_gift', params: { mode: 'apology', target: 'selected' } },
    ], { sourceId: 'player', _targetIds: ['gift_target'] })
    expect(target.base['愤怒']).toBe(0)
    expect(target.base['好感度']).toBe(40)
    expect(target.base['好意']).toBe(10)
  })
})
```

⚠️ 执行时确认 `gift_target` 角色存在（test-mod roster 或测试内注册），`_targetIds` 与 params.target 的优先级——以 effect-system 现有 target 解析为准（`selected = null` 时静默跳过 + warning，AGENTS §32）。

- [ ] **Step 2: 运行确认失败**——`npx vitest run src/plugins/h-core -t "give_gift"`
  Expected: 失败（give_gift 未注册）

- [ ] **Step 3: 实现**——`src/plugins/h-core/index.ts` 注册 effect（放在 body_item 效果段附近）：

```ts
  // ═══════════════════════════════════════════════════════════
  // 礼物效果（grill Q7：礼物基础版；erArk 22-礼物与咖啡系统.md §1）
  // ═══════════════════════════════════════════════════════════

  // 注释：give_gift——送礼（mode=favor 好感公式管线 / apology 道歉清愤怒）
  // favor：好感 += calcFavorability(target, favor_base)；talk_multiplier（小×1.5/中×2/大×3）
  //   由 mod 在效果参数提供；若有话术能力（hConfig gift_talk_ability_id 默认"话术"）
  //   则再乘 ability_lv_adjust[话术级]。trust_base 有值 → 信赖 += calcTrust(target, trust_base)
  // apology：愤怒=0 + 好感+10 + 好意+10（erArk 道歉礼物 171）
  // drug：由物品 effects 链直接表达，本 effect 不处理
  // mold（倒模）：TODO 未实装（依赖自定义物品生成，后续规划）
  effectTypeRegistry.register('give_gift', async (_p: any, execCtx: any) => {
    const mode = (_p.mode as string) ?? 'favor'
    const targetParam = (_p.target as string) ?? 'selected'
    const targetIds = (execCtx._targetIds as string[]) ?? []
    const targets = targetParam === 'selected'
      ? targetIds
      : targetParam === 'player'
        ? [execCtx.sourceId].filter(Boolean)
        : [targetParam]
    if (targets.length === 0) return true
    if (mode === 'mold') {
      // TODO 倒模礼物（erArk Gift_Items type 13）：目标获得道具 + 好感+100 + 羞耻+100——未实装
      return true
    }
    for (const id of targets) {
      const ch = entitySystem.get('character', id) as any
      if (!ch) continue
      if (mode === 'apology') {
        const angerAttr = (modLoader.getMod()?.hConfig as any)?.gift_anger_attr ?? '愤怒'
        if (ch.base) ch.base[angerAttr] = 0
        const favorAttr = (modLoader.getMod()?.hConfig as any)?.favorability_attr ?? '好感度'
        const kindnessAttr = (modLoader.getMod()?.hConfig as any)?.kindness_attr ?? '好意'
        if (ch.base) {
          ch.base[favorAttr] = (ch.base[favorAttr] ?? 0) + 10
          ch.base[kindnessAttr] = (ch.base[kindnessAttr] ?? 0) + 10
        }
        eventBus.emit('character:changed', { id })
        continue
      }
      // favor
      const base = (_p.favor_base as number) ?? 10
      let mult = (_p.talk_multiplier as number) ?? 1
      const mod = modLoader.getMod()
      const talkAbilityId = (mod?.hConfig as any)?.gift_talk_ability_id ?? '话术'
      const talkLv = ch.abilities?.[talkAbilityId]?.level ?? 0
      if (talkLv > 0) {
        const adjTable = (mod?.hConfig as any)?.ability_lv_adjust ?? [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
        mult *= adjTable[Math.min(Math.max(0, talkLv), 10)] ?? 4.0
      }
      const favorAttr = (mod?.hConfig as any)?.favorability_attr ?? '好感度'
      if (ch.base) {
        ch.base[favorAttr] = (ch.base[favorAttr] ?? 0) + calcFavorability(id, Math.floor(base * mult))
      }
      const trustBase = (_p.trust_base as number) ?? 0
      if (trustBase > 0) {
        const trustAttr = (mod?.hConfig as any)?.trust_attr ?? '信赖度'
        if (ch.base) ch.base[trustAttr] = (ch.base[trustAttr] ?? 0) + calcTrust(id, Math.floor(trustBase * mult))
      }
      eventBus.emit('character:changed', { id })
    }
    return true
  })
```

⚠️ 执行时确认 `calcTrust` 的签名（`src/plugins/h-core/settle/trust.ts`）——若与 calcFavorability 不同（如只接受数值），按实际签名适配；属性名 `好感度`/`信赖度`/`好意`/`愤怒` 经 hConfig 可配（属性名禁止硬编码铁律——hConfig 默认值 + mod 可改，参考 `favorability.ts` 现有 STATUS_MOD 硬编码先例，若项目已有统一属性名常量（`ATTR`），优先用 ATTR）。

- [ ] **Step 4: 运行确认通过**——`npx vitest run src/plugins/h-core -t "give_gift"` + `npm run test`
  Expected: 全绿

- [ ] **Step 5: 提交**——`git add src/plugins/h-core/index.ts mods/test-mod/definitions/items.toml && git commit -m "feat(item): 礼物基础版 give_gift effect（favor/apology，mold TODO）（Task 6）"`

---

### Task 7: 文档收尾 + 全量验证

**Files:**
- Rewrite: `docs/item-system.md`
- Modify: `docs/inventory-system.md`、`docs/mod-author-guide.md`（物品 schema 段）、`docs/master-todo.md`（顶部索引 + 勾选）
- Modify: `AGENTS.md`（模组目录结构 items 段注：`definitions/items.toml` → 目录拆分说明）
- 执行验证

- [ ] **Step 1: 重写 docs/item-system.md**——覆盖（按 grill 定稿）：
  - 物品 schema 全字段表（type 五枚举/use 数组/tags/consume/price/level/time_cost/body_slot/body_auto_remove/duration/tick_base/tick_part/attack_bonus/defense_bonus）
  - 分层：H 原生默认数据（h-core/data/default/items/）+ mod definitions/items/ 目录 + 单文件兼容
  - 消耗语义表（占用/归还/不归还三态）
  - body_item 槽位自由扩展 + 快捷前提硬编码说明
  - 校验规则表（error/warning/不校验）
  - 礼物基础版（give_gift modes）+ TODO（mold/商店/采集/咖啡加料）
  - 数据文件索引更新

- [ ] **Step 2: 更新 docs/inventory-system.md**——API 变化（useItem 返回 boolean + targetId 参数、removeItem 返回 boolean、消耗语义）
- [ ] **Step 3: 更新 docs/mod-author-guide.md**——物品字段协议（schema 表 + use 注册方式 + 校验规则）
- [ ] **Step 4: 更新 docs/master-todo.md**——顶部文档索引 + 本计划勾选记录
- [ ] **Step 5: 更新 AGENTS.md**——模组目录结构 `definitions/items.toml` 处加注：`# 可拆为 definitions/items/*.toml（按类别分文件）`
- [ ] **Step 6: 全量验证**——`npm run typecheck && npm run test`；`npm run dev` 冒烟（浏览器无报错）
- [ ] **Step 7: 复刻检查清单核对**——`docs/skills/replicating-an-instruction.md` 阶段 6 收尾项 + 架构合规铁律验证（`src/core/` 无玩法名词、插件无直接 import、API 文档一致）
- [ ] **Step 8: 提交**——`git add docs AGENTS.md && git commit -m "docs(item): 物品系统文档收尾（schema/目录/消耗语义/礼物基础版）（Task 7）"`
