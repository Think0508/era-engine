# 背包系统（inventory-system）

## 做什么

管理角色的物品背包：增加、移除、使用、装备/卸下。物品定义见 `docs/item-system.md`，本系统只负责运行时存取和执行物品 effects。支持装备槽（slot）和 H 身体部位物品。发出 `item:added`、`item:removed`、`item:used` 事件。

## 数据格式

物品定义在 `definitions/items.toml`（可拆为 `definitions/items/*.toml` 按类别分文件），背包运行时状态存在角色实体的 `inventory` 字段和 `equipment` 字段：

```json
{ "inventory": [{ "itemId": "大还丹", "count": 3 }],
  "equipment": { "weapon": "长剑", "body": "布衣" } }
```

> `inventory` 运行时为**数组**格式 `[{itemId, count}]`；mod 数据写对象写法 `{ 物品ID = 数量 }` 加载时自动转换（normalizeInventoryToArray，幂等）。

## Mod 作者使用

```toml
# 给物品加使用效果
[items.大还丹]
effects = [{type = "modify_attribute", params = {attr = "hp", value = 50}}]
```

物品的 effects 在 `useItem` 时自动执行。

## 消耗语义（2026-08-12 定案）

- `useItem` 的 `consume` 默认 `true`：**先扣 1 再执行 effects**；数量不足 → 拦截（不执行 effects，返回 false）
- `consume = false`：只执行 effects，不扣数量
- 装槽（body_item_equip）= 占用（背包 -1）；manual/h_end 卸下归还（+1）；expiry 到期/避孕套射精消耗/即时药（body_slot=-1）不归还（详见 `docs/item-system.md` §四）

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('inventory', 'addItem', charId, itemId, count)         → void
ctx.api.call('inventory', 'removeItem', charId, itemId, count)      → boolean（成功 true；物品不存在/数量不足/角色不存在 false）
ctx.api.call('inventory', 'useItem', charId, itemId, targetId?)     → Promise<boolean>（consume 默认 true 先扣 1，数量不足返回
                                                                      false 不执行 effects；consume=false 只执行 effects；
                                                                      targetId 提供时 effects 目标用 targetId（_targetIds=[targetId]），
                                                                      否则 [charId]；执行后 emit item:used）
ctx.api.call('inventory', 'getInventory', charId)                   → {itemId, count}[]
ctx.api.call('inventory', 'equip', charId, itemId, slot)            → void
ctx.api.call('inventory', 'unequip', charId, slot)                  → void
```

## Override 规则

物品定义遵循三层 override（`docs/mod-override.md`）。插件提供默认物品数据（h-core 的 `data/default/items/*.toml`），mod definitions/ 覆盖或新增物品。装备槽部位在 `definitions/equipment.toml` 中定义。
