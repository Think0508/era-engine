/**
 * 常用测试夹具：内存工作区种子（模拟 era-engine 目录结构）。
 */
import { MemoryFs } from '../fsAdapter'

export const ROOT = 'C:/era-engine'

const CHAT_TOML = `# chat 指令默认通用口上（插件默认层，Layer 1）
variable = "chat"
description = "聊天指令默认通用口上"

# ── 无条件组 ──────────────────────────────────────────────
[[entries]]
context = "{player.name}与{character.name}聊了一会儿天。"

# ── 高好感组 ──────────────────────────────────────────────
[[entries]]
conditions = "premise(high_1)"
context = "{player.name}和{character.name}在{location.name}里聊得很投机。"
`

const STROKE_TOML = `variable = "stroke"
description = "身体接触指令默认通用口上"

[[entries]]
conditions = "premise(FAVORABILITY_GE_3) && premise(TARGET_NOT_FALLEN)"
context = "{player.name}检查了{character.name}的身体状况。"
`

const INSTRUCTIONS_TOML = `
[effect_blocks]
chat_success_chain = []

[[instructions]]
id = "chat"
label = "聊天"
erark_id = "1004"
category = "daily"
tags = ["kind:play", "system:h-core"]
effects = [
  { type = "chat_settle", params = { success_scene = "chat", fail_scene = "chat_failed" } },
]

[[instructions]]
id = "stroke"
label = "身体接触"
erark_id = "1005"
category = "daily"
tags = ["kind:play", "system:h-core"]
effects = [
  { type = "trigger_dialogue", params = { scene = "stroke" } },
]
`

const SLEEP_INSTRUCTIONS_TOML = `
[[instructions]]
id = "sleep"
label = "睡觉"
erark_id = "1014"
category = "daily"
tags = ["kind:rest"]
`

export function buildSeed(): Record<string, string> {
  return {
    // 原生指令（多插件目录：native-instructions + sleep-system）
    [`${ROOT}/src/plugins/native-instructions/data/default/instructions/daily.toml`]: INSTRUCTIONS_TOML,
    [`${ROOT}/src/plugins/sleep-system/data/default/instructions/daily.toml`]: SLEEP_INSTRUCTIONS_TOML,
    // 默认层口上
    [`${ROOT}/src/plugins/talk-common-system/data/default/talk-common/behavior/daily/chat.toml`]: CHAT_TOML,
    [`${ROOT}/src/plugins/talk-common-system/data/default/talk-common/behavior/daily/stroke.toml`]: STROKE_TOML,
    [`${ROOT}/src/plugins/talk-common-system/data/default/talk-common/behavior/daily/chat_failed.toml`]: `variable = "chat_failed"\n[[entries]]\ncontext = "话不投机。"\n`,
    // 词表来源：body / body_part
    [`${ROOT}/src/plugins/talk-common-system/data/default/talk-common/body/penis.toml`]: `variable = "penis"\n[[entries]]\nconditions = "premise(jj_0)"\ncontext = "小巧的{penis_s}"\n`,
    [`${ROOT}/src/plugins/talk-common-system/data/default/talk-common/body_part/breast_s.toml`]: `variable = "breast_s"\nreplaces = [["胸"]]\n`,
    // 前提注册（src/**/*.ts 扫描）
    [`${ROOT}/src/core/condition-engine.ts`]: `conditionEngine.registerPremise("HIGH_1", () => 1)\nconditionEngine.registerPremise('NOT_H', () => true)\n`,
    // mod：武侠（被加载）
    [`${ROOT}/mods/武侠/definitions/instructions/spar.toml`]: `[[instructions]]\nid = "spar"\nlabel = "切磋"\ncategory = "daily"\ntags = ["kind:play"]\n`,
    [`${ROOT}/mods/武侠/definitions/talk-common/behavior/daily/chat.toml`]: `variable = "chat"\n[[entries]]\ncontext = "武侠 mod 版聊天口上。"\n`,
    [`${ROOT}/mods/武侠/definitions/talk/styles.toml`]: `[styles]\nnarrator = { color = "#666666", font = "楷体" }\nwhisper = { display = "typewriter", speed = 70 }\n`,
    // 插件默认层样式（引擎 mod-parse.collectPluginDefaultStyles 语义）
    [`${ROOT}/src/plugins/theme-base/data/default/talk/styles.toml`]: `[styles]\nnarrator = { color = "#111111" }\n`,
    // mod：example-mod（不被加载，仅出现在选择器里）
    [`${ROOT}/mods/example-mod/definitions/instructions/demo.toml`]: `[[instructions]]\nid = "demo"\nlabel = "示例"\ncategory = "daily"\n`,
    // 损坏文件
    [`${ROOT}/mods/武侠/definitions/talk-common/behavior/daily/broken.toml`]: `variable = "broken"\nentries = [\n`,
  } as Record<string, string>
}

export function makeWorkspaceFs(): MemoryFs {
  return new MemoryFs(buildSeed())
}