# Mod Override 规范

> 引擎所有数据 override 的统一规则。任何系统的手册引用此文档即可，不再重复定义。

---

## 三层优先级链

引擎加载数据时，同一数据 ID 可能出现在多个来源。按以下优先级决定谁赢：

| 层 | 来源 | 路径 | 谁写的 | 优先级 |
|----|------|------|--------|--------|
| 1 | 通用插件默认 | `src/plugins/*/data/default/` | 插件作者 | 低 |
| 2 | Mod 专属插件数据 | `mods/[mod]/plugins/*/data/` | Mod 插件作者 | 中 |
| 3 | Mod 定义数据 | `mods/[mod]/definitions/` | Mod 内容作者 | **高** |

## 合并规则（所有数据类型通用）

> **2026-08-09 修正**：层间合并与模板继承共用同一个 `deepMerge`（`src/core/template.ts`）——
> **数组一律整表替换**（子层数组完全替换父层数组，不追加不去重）。此前的"对象数组 ID 匹配替换 /
> 基本类型数组追加去重"表述与代码不符，已更正（ADR-0003 同步）。

| 数据类型 | 规则 | 示例 |
|---------|------|------|
| 基本类型（number/string/boolean） | 高层覆盖低层 | 插件默认 `体力=100`，mod 定义 `体力=120` → 结果 120 |
| 对象（key-value map） | **深合并**：高层 key 覆盖低层同名 key，低层独有 key 保留 | `{a:1, b:2}` + `{b:3, c:4}` → `{a:1, b:3, c:4}` |
| **数组（含对象数组）** | **整表替换**：高层数组完全替换低层数组 | 插件 `["a","b"]`，mod `["b","c"]` → `["b","c"]` |
| `= null` | **删除**该字段，从合并结果中完全移除 | 插件有 `天赋.剑骨`，mod 写 `剑骨 = null` → 结果无此天赋 |

> **写差分的含义**：层间"差分"是推荐写法而非强制——任何一层显式写了字段值，该值即最终值。
> 代价：写全量 = 脱离继承（上层默认更新后不会自动跟随）；数组整表替换下尤其如此（写数组
> 即使只想加一个元素，也会丢掉父层其余元素）。

## 层间与层内规则

| 情况 | 处理 | debug 提示 |
|------|------|-----------|
| 同层同名 ID | **报错**，阻断加载，报两个来源文件路径+行号 | `ID '中毒' 冲突：plugin-a/data/status.toml:12 vs plugin-b/data/status.toml:8` |
| 跨层同名 ID | **高覆盖低**，不报错，这是预期行为 | — |
| 层 1/2 特有 ID（低层有、高层无） | **保留** | — |
| 层 3 特有 ID（高层有、低层无） | **新增** | — |

## Mod 专属插件的隐式路径匹配

Layer 2（`mods/[mod]/plugins/*/data/`）下的目录结构**镜像** Layer 1 的 `data/default/` 结构。

引擎加载时：
1. 扫描所有层 1 插件的 `data/default/`，记录命名空间 + 相对路径
2. 扫描所有层 2 插件的 `data/`，按相对路径匹配层 1
3. 匹配到 → 按合并规则覆盖；没匹配到 → 视为新增 ID

```
Layer 1: src/plugins/talk-common-system/data/default/talk-common/body_part/breasts_s.toml
                                                        └──────────┬──────────┘
                                                                   │ 相对路径
Layer 2: mods/武侠/plugins/qinggong-system/data/talk-common/body_part/breasts_s.toml
                                              └──────────┬──────────┘
                                                         相同相对路径 → 覆盖
```

Layer 3（`definitions/`）不使用路径匹配，文件直接按声明的 ID 参与合并。

## 运行时 override（非数据）

数据规则不覆盖运行时行为。运行时 handler 使用**后注册覆盖前注册**：

| 可 override 的运行时对象 | 机制 | 示例 |
|------------------------|------|------|
| 前提（Premise） | `registerPremise(id, handler)` 同名 ID 覆盖 | 插件注册了 `EXPECTED`，mod 插件重注册覆盖 |
| 效果类型（Effect type） | `effectTypeRegistry.register(type, handler)` 同名覆盖 | 同上 |
| 指令 | `commandRegistry.register(cmd)` 同名 `id` 覆盖 | 同上 |
| UI 插槽 | `ctx.ui.registerSlot(slotName, item)` 同名 `id` 覆盖 | 同上 |

运行时 override 按**加载顺序**决定（不报错）：

```
mod 专属插件 onEnable → 覆盖 → 通用插件 onEnable 阶段注册的 handler
```

这也意味着如果通用插件 A 在 onEnable 注册了一个前提，mod 专属插件 B 在
自己的 onEnable 里注册同名前提，B 的 handler 赢（后加载）。

## 快速参考表

```
要做什么？                           →   怎么做？
─────────────────────────────────────────────────────────────
插件提供默认数据                     →   放在 src/plugins/*/data/default/
Mod 插件覆盖插件默认数据              →   放在 mods/[mod]/plugins/*/data/，镜像路径
Mod 内容作者微调数据                  →   放在 mods/[mod]/definitions/
新增一个不存在的 ID                   →   直接在对应层写新文件
删除插件默认的某个条目                →   高层写 = null
修改插件默认的某个字段                →   高层写同名 key
覆盖插件注册的前提/效果/指令           →   在自己的 onEnable 里同名注册
两个插件不小心写了同名的数据           →   引擎报错，检查冲突
Mod 想改某特性的行为逻辑               →   写 mod 专属插件（extends 或独立）
