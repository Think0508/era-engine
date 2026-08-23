/**
 * 新文件骨架 / mod 覆盖复制：
 * - 默认层新建：空骨架（仿现有 behavior 文件风格）。
 * - mod 覆盖新建：复制默认层当前全文（原有注释零改动），修者只改差异。
 */
import { joinPath } from './fsAdapter'

export function skeletonTalkFile(variable: string, label?: string): string {
  const display = label && label.length > 0 ? label : variable
  return `# ${variable} 指令默认通用口上（插件默认层，Layer 1）
# ============================================================
# ⚠️ 骨架说明：等待人工手写替换；占位符格式「${display}指令通用口上 N」。
# - 前提写法：无条件组（恒真）不写条件；高好感组使用 premise(high_1)。
# - mod 可覆盖：mods/[模组名]/definitions/talk-common/ 下同路径文件覆盖本默认层。

variable = "${variable}"
description = "${display}指令默认通用口上（角色通用口上 Layer 1 兜底，mod 可覆盖）"

# ── 无条件组 ──────────────────────────────────────────────
[[entries]]
context = "${display}指令通用口上 1"
`
}

/** behavior 树内相对路径：behavior/{category}/{variable}.toml */
export function talkRelPath(category: string | undefined | null, variable: string): string {
  const cat = category && category.trim().length > 0 ? category.trim() : 'daily'
  return joinPath('behavior', cat, `${variable}.toml`)
}