# 绑定系统 — bindings

> 插件说 `hp`，mod 说 `体力`——bindings 是两者之间的翻译层。

---

## 什么时候需要

**只有插件在 `plugin.toml` 中声明了 `required_attributes` 时才需要写 `bindings.toml`。**

大多数插件（h-core、combat-wuxia……）直接引用 `ATTR` 常量中的中文属性名，**不走绑定系统**。
用这些插件的 mod **默认不需要写 `bindings.toml`**。

## 什么时候才写

### 场景 1：插件声明了 required_attributes

```toml
# combat-wuxia/plugin.toml
[required_attributes]
hp = { type = "number", description = "生命值" }
attack = { type = "number", description = "攻击力" }
```

你的 mod 不叫 `hp`，叫 `"气血"`：

```toml
# bindings.toml
[bindings.combat-wuxia]
hp = "气血"
attack = "攻击力"
```

### 场景 2：你想统一改一批属性名

H 插件硬编码了 `ATTR.HP`（`'体力'`），但你全 mod 叫 `"气血"`。你想让所有走 bindings 的插件自动翻译：

```toml
[bindings.combat-base]
hp = "气血"
mp = "内力"
```

## 不写 bindings.toml 时

插件直接通过 `ATTR` 常量引用中文属性名。属性定义在 `attributes.toml` 中，
角色数据在 `templates/` 和 `roster.toml` 中。这时不需要 bindings 层介入。

## bindings 与 override 的区别

| | bindings | override |
|--|----------|----------|
| 解决什么问题 | 插件说 A，mod 说 B，翻译 | 同一份数据有多层来源，谁优先 |
| 文件 | `bindings.toml` | 多层数据源（plugin default → mod plugin → mod definitions）|
| 范围 | 仅 `required_attributes` | 所有定义数据 |
| 不改名时需要 | ❌ | ✅ 默认就需要 |

详见 `docs/mod-override.md`。
