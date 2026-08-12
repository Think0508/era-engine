# 套装系统（set-system）

## 做什么

检测角色是否满足预设的集合条件（能力集、物品集合、标签组合），激活后提供被动加成或触发效果。适用于装备套装检测、武功相辅相成、天赋分支解锁。支持三种集合类型：ability（能力集）、item（物品集）、tag（标签集）。

## 数据格式

```toml
# definitions/sets.toml
[sets.五岳剑法]
name = "五岳剑法"
type = "ability"                  # ability | item | tag
members = ["华山剑法", "恒山剑法", "泰山剑法", "衡山剑法", "嵩山剑法"]
min_required = 3                  # 至少激活 3 个才生效（缺省=全部）
effects = [{type = "modify_attribute", params = {attr = "攻击力", value = 20}}]
```

- `type="item"`：检查角色装备槽或背包中是否同时拥有这些物品
- `type="tag"`：检查角色能力/物品/状态是否覆盖指定标签

## Mod 作者使用

在 `definitions/sets.toml` 定义套装。可用作装备套装、武功相辅相成、H 状态分支激活。effects 在集合激活时自动应用。

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('set', 'checkSets', charId)      → Promise<void>（检查套装状态：凑齐给效果、失去件移除）
ctx.api.call('set', 'getActiveSets', charId)  → string[]（激活的套装 ID 列表）
```

## Override 规则

套装定义遵循三层 override（`docs/mod-override.md`）。插件可提供默认套装数据，mod 同名 ID 覆盖或新增套装。
