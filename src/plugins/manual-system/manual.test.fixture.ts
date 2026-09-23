// 注释：manual-system 测试夹具（2026-09-23）——自包含 mod 数据（不污染 mods/ 下的真实模组）
// 覆盖：品级表（三流/绝世）/ 秘籍（含残本链与层门槛）/ 内功（可装配）/ 分层与不分层被动技能 /
//       卷册物品（人皮 cap5、上卷 cap7、完整本、初级拳法秘籍）

export const rawTomlMap: Record<string, string> = {
  '/mods/manual-test/meta.toml': `
[meta]
id = "manual-test"
name = "manual-test"
version = "1.0.0"
player_character = "player_01"
`,
  '/mods/manual-test/bindings.toml': `
[bindings.combat-base]
hp = "hp"
mp = "mp"
hp_max = "hp_max"
mp_max = "mp_max"
`,
  '/mods/manual-test/definitions/attributes.toml': `
[attributes]
"经验" = { type = "number", default = 0, category = "base" }
"内功位" = { type = "number", default = 1, category = "base" }
"悟性" = { type = "number", default = 10, category = "base" }
"拳掌系数" = { type = "number", default = 0, category = "base" }
"武学常识" = { type = "number", default = 0, category = "base" }
"气血上限" = { type = "number", default = 100, category = "base" }
"轻灵" = { type = "number", default = 0, category = "base" }
"hp" = { type = "number", default = 100, category = "base" }
"hp_max" = { type = "number", default = 100, category = "base" }
"mp" = { type = "number", default = 50, category = "base" }
"mp_max" = { type = "number", default = 50, category = "base" }
`,
  '/mods/manual-test/definitions/manual-tiers.toml': `
[manual-tiers.category_attrs]
"拳掌" = "拳掌系数"

[manual-tiers.tiers."三流"]
xp_base = 250
xp_base_internal = 1250
xp_base_skill = 200
cost = 170
ratio = 1.15
coeff_bands = [
  { from = 1, to = 3, min = 1, max = 1 },
  { from = 3, to = 5, min = 1, max = 2 },
  { from = 5, to = 99, min = 2, max = 4 },
]
auto_growth = [ { attr = "武学常识", flat = 1 } ]

[manual-tiers.tiers."绝世"]
xp_base = 55000
xp_base_internal = 275000
xp_base_skill = 100
ratio = 1.15
coeff_bands = [ { from = 1, to = 99, min = 2, max = 2 } ]
auto_growth = [ { attr = "武学常识", flat = 6 } ]
`,
  '/mods/manual-test/definitions/manual-config.toml': `
[manual]
exp_attr = "经验"
slot_attr = "内功位"
wit_attr = "悟性"
xp_per_wit = 10
kill_exp_divisor = 10
first_kill_multiplier = 3
`,
  '/mods/manual-test/definitions/abilities.toml': `
[abilities."九阴真经心法"]
name = "九阴真经心法"
type = "passive"
max_level = 11
passive_kind = "内功"
tags = ["combat_passive"]
equipped_mods = [ { attr = "气血上限", flat = 200, per_level = 50 }, { attr = "轻灵", flat = 3 } ]

[abilities."九阴白骨爪"]
name = "九阴白骨爪"
type = "active"
max_level = 10
category = "拳掌"
power = 100
cost = 5
tags = ["combat_active", "拳掌"]

[abilities."摧坚神爪"]
name = "摧坚神爪"
type = "active"
max_level = 10
category = "拳掌"
power = 150
cost = 5
tags = ["combat_active", "拳掌"]

[abilities."凌波微步"]
name = "凌波微步"
type = "passive"
max_level = 0
tags = ["combat_passive", "movement"]
attribute_mods = [ { attr = "轻灵", flat = 5 } ]

[abilities."龟息功"]
name = "龟息功"
type = "passive"
max_level = 5
passive_kind = "内功"
tags = ["combat_passive"]
equipped_mods = [ { attr = "轻灵", flat = 1 } ]

[abilities."基础掌法"]
name = "基础掌法"
type = "active"
max_level = 10
category = "拳掌"
power = 50
cost = 5
tags = ["combat_active", "拳掌"]
`,
  '/mods/manual-test/definitions/talents.toml': `
[talents."九阴天赋"]
name = "九阴天赋"
description = "九阴真经练至第十层的感悟"
max = 1
category = "learned"
tags = ["wuxia"]
`,
  '/mods/manual-test/definitions/manuals.toml': `
[manuals."九阴真经"]
name = "九阴真经"
description = "天下武学总纲"
tier = "绝世"
kind = "skill"
category = "拳掌"
max_layer = 11
layer_growth = [ { attr = "轻灵", flat = 1 } ]
xp = { base = 100, ratio = 1.15 }
requires = "selected.悟性 >= 5"

[[manuals."九阴真经".layer_rewards]]
layer = 1
ability = "九阴真经心法"

[[manuals."九阴真经".layer_rewards]]
layer = 3
ability = "九阴白骨爪"

[[manuals."九阴真经".layer_rewards]]
layer = 4
ability = "凌波微步"

[[manuals."九阴真经".layer_rewards]]
layer = 8
ability = "摧坚神爪"

[[manuals."九阴真经".layer_rewards]]
layer = 10
talent = "九阴天赋"
attributes = [ { attr = "轻灵", flat = 12 } ]

[[manuals."九阴真经".layer_requires]]
layer = 6
condition = "selected.abilities.九阴真经心法.level >= 5"

[manuals."初级拳法"]
name = "初级拳法"
tier = "三流"
kind = "skill"
category = "拳掌"
max_layer = 10

[[manuals."初级拳法".layer_rewards]]
layer = 1
ability = "基础掌法"
`,
  '/mods/manual-test/definitions/items.toml': `
[items."九阴人皮"]
name = "九阴人皮"
type = "key"
stackable = false
consume = false
tags = ["manual", "kungfu"]
manual_access = { manual = "九阴真经", cap = 5 }

[items."九阴真经上卷"]
name = "九阴真经上卷"
type = "key"
stackable = false
consume = false
tags = ["manual", "kungfu"]
manual_access = { manual = "九阴真经", cap = 7 }

[items."九阴真经·完整"]
name = "九阴真经"
type = "key"
stackable = false
consume = false
tags = ["manual", "kungfu"]
manual_access = { manual = "九阴真经" }

[items."九阴真经总纲"]
name = "九阴真经总纲"
type = "key"
stackable = false
consume = false
tags = ["plot"]

[items."初级拳法秘籍"]
name = "初级拳法秘籍"
type = "key"
stackable = false
consume = false
tags = ["manual", "kungfu"]
manual_access = { manual = "初级拳法" }
`,
}
