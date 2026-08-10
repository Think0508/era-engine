// 注释：native-instructions——纯数据插件（系统级原生指令的唯一家）
// 本插件无逻辑代码：指令 TOML 放 data/default/instructions/（mod 可 override）。
// 2026-08-10 建立骨架；follow/end_follow 等系统级指令在复刻批次时落此
// （chat/rest 等通用日常指令届时从 h-core/data/default/instructions/ 迁入）。
import type { PluginContext } from '../../core/types'

export function onLoad(_ctx: PluginContext): void {
}

export function onEnable(_ctx: PluginContext): void {
}
