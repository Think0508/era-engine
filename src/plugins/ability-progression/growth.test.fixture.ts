// 成长系统测试夹具（2026-08-11）——growth.test.ts 专用 mod 数据
// 条件驱动升级能力：全 need 类型/主备选/ability_sum/sex_need/多 J

export const rawTomlMap: Record<string, string> = {
  '/mods/growth-test/meta.toml': `
[meta]
id = "growth-test"
name = "growth-test"
version = "1.0.0"
player_character = "player_01"
`,
  '/mods/growth-test/definitions/attributes.toml': `
[attributes]
"体力" = { type = "number", default = 100, category = "base" }
"气力" = { type = "number", default = 100, category = "base" }
"体力上限" = { type = "number", default = 2500, category = "base" }
"气力上限" = { type = "number", default = 2000, category = "base" }
"精力" = { type = "number", default = 100, category = "base" }
"精力上限" = { type = "number", default = 100, category = "base" }
"欲望值" = { type = "number", default = 0, category = "base" }
"好感度" = { type = "number", default = 0, category = "social" }
"信赖度" = { type = "number", default = 0, category = "social" }
"射精欲" = { type = "number", default = 0, category = "base" }
"射精欲上限" = { type = "number", default = 1000, category = "base" }
"精液量" = { type = "number", default = 100, category = "base" }
"精液量上限" = { type = "number", default = 100, category = "base" }
"额外精液量" = { type = "number", default = 0, category = "base" }
"皮肤" = { type = "number", default = 0, category = "parameter", daily_reset = true, level_thresholds = [0, 100, 500] }
"苦痛" = { type = "number", default = 0, category = "parameter", daily_reset = true, level_thresholds = [0, 100, 500] }
"恐怖" = { type = "number", default = 0, category = "parameter", daily_reset = true, level_thresholds = [0, 100, 500] }
"抑郁" = { type = "number", default = 0, category = "parameter", daily_reset = true, level_thresholds = [0, 100, 500] }
"屈服" = { type = "number", default = 0, category = "parameter", daily_reset = true, level_thresholds = [0, 100, 500] }
"恭顺" = { type = "number", default = 0, category = "parameter", daily_reset = true, level_thresholds = [0, 100, 500] }
`,
  '/mods/growth-test/definitions/abilities.toml': `
[abilities]
[abilities."采药"]
name = "采药"
type = "passive"
max_level = 3
tags = ["life"]
mode = "condition"
[[abilities."采药".upgrades]]
needs = [{ type = "experience", id = 80, value = 5 }]
[[abilities."采药".upgrades]]
needs = [{ type = "juel", id = 9, value = 100 }]
[[abilities."采药".upgrades]]
needs = [{ type = "ability", id = "亲密", value = 2 }]
backup_needs = [{ type = "favorability", value = 60 }]
[abilities."亲密"]
name = "亲密"
type = "passive"
max_level = 8
tags = ["abl"]
mode = "condition"
[[abilities."亲密".upgrades]]
needs = [{ type = "juel", id = 10, value = 100 }, { type = "juel", id = 16, value = 50 }]
[abilities."隐蔽"]
name = "隐蔽"
type = "passive"
max_level = 2
tags = ["technique"]
mode = "condition"
extra_needs = [{ type = "ability_sum", tag = "technique", per_level = 2, per_level_npc = 3 }]
[[abilities."隐蔽".upgrades]]
needs = [{ type = "juel", id = 9, value = 70 }, { type = "juel", id = 16, value = 70 }]
[[abilities."隐蔽".upgrades]]
needs = [{ type = "juel", id = 9, value = 400 }]
[abilities."指技"]
name = "指技"
type = "passive"
max_level = 8
tags = ["technique"]
mode = "condition"
[[abilities."指技".upgrades]]
needs = [{ type = "juel", id = 9, value = 70 }]
[abilities."吐纳"]
name = "吐纳"
type = "passive"
max_level = 3
tags = ["internal"]
mode = "condition"
[[abilities."吐纳".upgrades]]
needs = [{ type = "talent", id = "剑骨" }]
[[abilities."吐纳".upgrades]]
needs = [{ type = "juel", id = 9, value = 100 }]
[[abilities."吐纳".upgrades]]
needs = [{ type = "trust", value = 50 }]
[abilities."腰技"]
name = "腰技"
type = "passive"
max_level = 8
tags = ["technique"]
mode = "condition"
sex_need = 0
[[abilities."腰技".upgrades]]
needs = [{ type = "juel", id = 9, value = 70 }]
[abilities."胸技"]
name = "胸技"
type = "passive"
max_level = 8
tags = ["technique"]
mode = "condition"
sex_need = 1
[[abilities."胸技".upgrades]]
needs = [{ type = "juel", id = 9, value = 70 }]

[abilities."玄功"]
name = "玄功"
type = "passive"
max_level = 2
tags = ["internal"]
`,
  '/mods/growth-test/definitions/ability-upgrades.toml': `
[abilities."玄功"]
mode = "condition"
[[abilities."玄功".upgrades]]
needs = [{ type = "juel", id = 9, value = 50 }]
[[abilities."玄功".upgrades]]
needs = [{ type = "juel", id = 9, value = 100 }]
`,
  '/mods/growth-test/definitions/talents.toml': `
[talents]
[talents."剑骨"]
name = "剑骨"
max = 1
tags = ["innate"]
`,
  '/mods/growth-test/definitions/juels.toml': `
[juels]
[juels."9"]
name = "习得珠"
status_attr = "习得"
[juels."10"]
name = "恭顺珠"
status_attr = "恭顺"
[juels."16"]
name = "羞耻珠"
status_attr = "羞耻"
[juels."17"]
name = "苦痛珠"
status_attr = "苦痛"
[juels."18"]
name = "恐怖珠"
status_attr = "恐怖"
[juels."19"]
name = "抑郁珠"
status_attr = "抑郁"
[juels."20"]
name = "反感珠"
status_attr = "反感"
[juels."15"]
name = "屈服珠"
status_attr = "屈服"
[juels."0"]
name = "皮肤快感珠"
status_attr = "皮肤"
`,
}