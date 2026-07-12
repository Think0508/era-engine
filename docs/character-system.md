# 角色系统（character-system）

## 做什么

管理所有角色的数据存取、属性读写、关系值、位置变更。三类角色：重要角色（named/独立文件夹）、次要角色（roster.toml 批量清单）、路人 NPC（npc.toml 模板实例化）。角色是 EntityData 容器，所有字段由模组自行定义，引擎不预设任何属性名。

## 数据格式

```toml
# roster.toml 次要角色
[[roster]]
id = "华山_陆大有"
template = "huashan_disciple"
name = "陆大有"
base = { 年龄 = 18, 气血 = 200 }
abilities = { 华山剑法 = 3 }
factions = { 华山派 = "弟子" }
```

重要角色独立文件夹内含 `base.toml`、`dialogue.toml`、`conversations/`、`behavior.toml`、`assets/`。NPC 用 `npc.toml` spawn 规则首次进入地点时按模板生成。

## Mod 作者使用

- 50-100 重要角色用独立文件夹，500+ 次要角色放 roster.toml
- roster 角色如需独立口上/素材，把 id 移到 named/，保留差异属性作为 base.toml 的 override
- 角色初始位置由 behavior.home_locations 权重最高的决定

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('character', 'getCharactersAt', locationId)  → EntityData[]
ctx.api.call('character', 'getLocation', charId)           → string | null
ctx.api.call('character', 'getAttribute', charId, attr)    → any
ctx.api.call('character', 'setAttribute', charId, attr, v) → void
ctx.api.call('character', 'setField', charId, path, v)     → void
ctx.api.call('character', 'getRelation', charId, tid, typ) → number
ctx.api.call('character', 'setRelation', ...)              → void
ctx.api.call('character', 'moveTo', charId, locId)         → void
```

## Override 规则

角色模板（`templates/character/`）按对象深合并，子覆盖父。定义层角色数据覆盖插件默认数据（见 `docs/mod-override.md`）。
