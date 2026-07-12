# 背包系统（inventory-system）

## 做什么

管理角色的物品背包：增加、移除、使用、装备/卸下。物品定义见 `docs/item-system.md`，本系统只负责运行时存取和执行物品 effects。支持装备槽（slot）和 H 身体部位物品。发出 `item:added`、`item:removed`、`item:used` 事件。

## 数据格式

物品定义在 `definitions/items.toml`，背包运行时状态存在角色实体的 `inventory` 字段和 `equipment` 字段：

```json
{ "inventory": [{ "itemId": "大还丹", "count": 3 }],
  "equipment": { "weapon": "长剑", "body": "布衣" } }
```

## Mod 作者使用

```toml
# 给物品加使用效果
[items.大还丹]
effects = [{type = "modify_attribute", params = {attr = "hp", value = 50}}]
```

物品的 effects 在 `useItem` 时自动执行。

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('inventory', 'addItem', charId, itemId, count)    → void
ctx.api.call('inventory', 'removeItem', charId, itemId, count) → void
ctx.api.call('inventory', 'useItem', charId, itemId)           → void
ctx.api.call('inventory', 'getInventory', charId)              → {itemId, count}[]
ctx.api.call('inventory', 'equip', charId, itemId, slot)       → void
ctx.api.call('inventory', 'unequip', charId, slot)             → void
```

## Override 规则

物品定义遵循三层 override（`docs/mod-override.md`）。插件提供默认物品数据，mod definitions/ 覆盖或新增物品。装备槽部位在 `definitions/equipment.toml` 中定义。
