# Mod 开发工作流

> 从零做一个 ERA 模组的完整路径。以"500 个角色先用通用口上，
> 逐渐升级十几个名角到专属剧情"的常见场景为例。
>
> **新手先看**：`mods/example-mod/`（教学范例模组——每个文件带注释，复制改 id 即用）
> + `docs/mod-file-guide.md`（逐文件字段字典：能写什么/形式/区间/默认）。

---

## 第 0 步：建立骨架

创建 `mods/你的mod名/` 目录，写 `meta.toml`、`bindings.toml`、`theme.toml`。

**插件提供全套默认属性/能力/装备/状态/关系**（h-core 的 `data/default/`），
所以你不需要从头写 `attributes.toml`。只在想修改默认值时写对应文件。

```
你的 mod 目录初始只需：
  meta.toml          ← 模组元信息（必需）
  bindings.toml      ← 属性绑定（需要时才写）
  theme.toml         ← 颜色字体（必需）

插件已提供（你不写就自动用这些默认值）：
  attributes.toml    ← 体力/好感度/每日重置参数
  abilities.toml     ← 感觉/ABL/刻印/性技术
  equipment.toml     ← 9 个基础装备槽
  status-effects.toml ← 中毒/醉意等通用状态
  relations.toml     ← 好感度关系类型
```

完成 0 步意味着游戏能启动、能看到玩家角色。

参考：`docs/mod-author-guide.md`、`docs/mod-file-guide.md`（逐文件字段字典）、`mods/example-mod/`（教学范例）、`mods/test-mod/`（测试模组）

---

## 第 1 步：写武侠通用口上（覆盖所有角色）

两个文件，注意区分：

```toml
# definitions/scene-dialogue.toml
# 🎭 旁白/环境描述——没有说话者
# 场景描述、环境气氛、进入地点时的文字
# 触发方式：进入地点、时间变化、特殊事件
[[scene_lines]]
scene = "enter"
text = "你走进{location.name}，{location.description}。"

[[scene_lines]]
scene = "rest"
text = "你找了处干净地方坐下来，闭目调息。"
```

```toml
# definitions/character-dialogue.toml
# 💬 角色通用口上——没有专属口上的任何角色都说这个
# 这是 500 人的默认台词
# 触发方式：指令执行后触发对口上（greet/hurt/rest 等）
[[character_lines]]
scene = "greet"
text = "{character.name}对你拱手致意。"

[[character_lines]]
scene = "hurt"
text = "{character.name}闷哼一声。"
```

**为什么分两个文件？**

| 文件 | 谁说话 | 例子 |
|------|--------|------|
| `scene-dialogue.toml` | **旁白**（没有角色名） | "剑坪上落满了梧桐叶。" |
| `character-dialogue.toml` | **角色**（显示角色名） | "令狐冲对你拱手致意。" |

第 1 步做完：500 个角色都有基本的武侠口上了。

---

## 第 2 步：挑选角色，做专属口上

选定一个角色（比如令狐冲），在 `characters/` 下建文件夹：

```
characters/
├── named/
│   └── 令狐冲/
│       ├── base.toml       ← 角色数据（可选，用于覆盖 roster 默认）
│       └── dialogue.toml   ← 专属口上
├── roster.toml              ← 500 人的大清单
└── npc.toml
```

**专属口上文件 `dialogue.toml`**：

```toml
# characters/named/令狐冲/dialogue.toml

[[lines]]
scene = "greet"
condition = "player.好感度 >= 60"
text = "师弟来得正好，陪我喝一杯！"

[[lines]]
scene = "greet"
text = "你是何人？怎敢擅闯华山禁地？"

[[lines]]
scene = "hurt"
text = "嘶……下手倒是不轻。"
```

**引擎匹配规则**：
1. 角色有专属口上 → 用专属的
2. 没有专属 → 用 `character-dialogue.toml` 的通用 fallback
3. 两种都同时保留场景通用口上（`scene-dialogue.toml`）

第 2 步做完：令狐冲有自己的台词了，其他 499 人继续用通用的。

---

## 第 3 步：加交互式对话

在 `characters/named/令狐冲/conversations/` 下建对话树文件：

```toml
# characters/named/令狐冲/conversations/talk_about_sword.toml
id = "talk_about_sword"
condition = "quest.独孤九剑.status == 'active'"

[[nodes]]
id = "start"
lines = ["令狐冲道：师弟，你来了。"]
choices = [
  { text = "询问独孤九剑", next = "ask_sword" },
  { text = "闲聊", next = "chitchat" },
  { text = "告别", next = "farewell" }
]

[[nodes]]
id = "ask_sword"
lines = ["令狐冲低声道：独孤九剑讲究无招胜有招..."]
effects = [{type = "set_field", params = {path = "abilities.独孤九剑", value = 1}}]
next = "start"

[[nodes]]
id = "farewell"
lines = ["令狐冲挥手道别。"]
effects = [{type = "exit_mode", params = {}}]
```

触发方式：玩家点"交谈"指令 → dialogue-system 自动选 condition 满足的对话。
参考：`docs/dialogue-format.md`

---

## 第 4 步：加任务链

`quests/main/find_master.toml`

任务可以引用对话中的节点，也可以触发战斗、收集物品等。
参考：`docs/mod-author-guide.md`

---

## 第 5 步：从通用升级到专属（渐进路径）

随着开发，更多角色从"500 人通用"升级为"专属剧情"。流程如下：

```
1. 确认角色在 roster.toml 中已有条目
2. 创建 characters/named/{角色ID}/ 目录
3. 可选：加 base.toml（roster 的条目已经够用就不需要）
4. 加 dialogue.toml ← 覆盖通用 fallback
5. 加 conversations/ ← 交互式对话
6. 加 quests/ ← 专属任务
```

**base.toml 什么时候需要**？

| 场景 | 需要 base.toml？ |
|------|-----------------|
| 只是给 roster 角色加专属口上 | ❌ 不需要，roster 条目已经定义了属性 |
| 顺便想改角色的某些属性 | ✅ 需要，base.toml 的值覆盖 roster |
| 想给角色加专属天赋/能力 | ✅ 需要 |

**base.toml 示例**：

```toml
# characters/named/令狐冲/base.toml
id = "令狐冲"
name = "令狐冲"
template = "huashan_disciple"

[base]
"好感度" = 80
"酒气" = 999

[talents]
"剑骨" = 1

[abilities]
"独孤九剑" = 1
```

**重复注册规则**：如果 `roster.toml` 和 `named/{id}/base.toml` 有**同名 ID**，
named 版本覆盖 roster 版本。删除 named 文件夹后 roster 条目自动生效。

---

## 总结：文件结构全貌

```
mods/武侠/
├── definitions/
│   ├── scene-dialogue.toml          ← 旁白描述（全 mod 通用）
│   └── character-dialogue.toml      ← 角色通用口上（500 人 fallback）
├── characters/
│   ├── roster.toml                  ← 500 人角色数据
│   ├── named/
│   │   ├── 令狐冲/
│   │   │   ├── base.toml           ← 专属数据（可选）
│   │   │   ├── dialogue.toml       ← 专属口上
│   │   │   └── conversations/       ← 交互式对话
│   │   ├── 岳灵珊/
│   │   │   ├── base.toml
│   │   │   └── dialogue.toml
│   │   └── ...
│   └── npc.toml                     ← 路人生成规则
├── quests/
│   ├── main/
│   │   └── find_master.toml
│   └── side/
│       └── ...
└── ...
```

随着开发，`named/` 下的角色逐渐增多，`character-dialogue.toml` 的覆盖范围逐渐缩小。
这就是 ERA 模组的典型开发节奏。
