// 注释：h-exposure 插件——露出系统，对齐 erArk（2026-08-15 完整复刻）
// 5 级露出模式（0=无 1=室内露出 2=室外露出 3=人前露出 4=无意识人前）
// 动态模式切换 + 露出持续快感 tick + 露出经验 + 成就 + h:end 清理 + 前提全集
//
// 接线层（W 拆分，对齐 h-hidden 结构）：
//   效果注册在 effects.ts；前提注册在 premises.ts；公共 API 在 api.ts；
//   场景生命周期/动态切换/持续快感/经验/成就/UI 标签在 scene.ts
//
// 参考 erArk 源文件：
//   exhibitionism_sex_panel.py       — 动态模式切换（12-露出系统.md §3）
//   realtime_settle.py:610-613       — 露出中羞耻/心理快感
//   settle_behavior.py:670-672       — 露出经验 +1
//   default.py:4191 + h:end           — 露出模式清零（404 语义）
//   handle_premise_sp_flag.py        — 露出前提（constant_promise.py:1664-1689）
//   game_type.py:762-763/933-934     — 数据结构
//   InstructConfig.csv:5207/6007     — 指令配置（数据在 data/default/instructions/）
//
// ⚠️ 设计决策（详见 ADR-0014）：
//   - 门未锁条件砍掉（门概念限定世界观，通用 mod 无门模型）；室内外用 location tag
//     `has_indoor` 判定（缺省=室外）
//   - 被发现处理（Sex_Be_Discovered_Panel）未实现——面板级 UI 推迟，TODO 占位
//   - 邀请模式选择面板未实现——exposure_set_level level 缺省=按场景自动计算

import type { PluginContext } from '../../core/types'
import { registerExposureEffects } from './effects'
import { registerExposurePremises } from './premises'
import { registerExposureApi } from './api'
import { registerExposureSceneLogic, checkIndoorTagCoverage } from './scene'

export function onLoad(_ctx: PluginContext): void {
  registerExposureEffects()
}

export async function onEnable(ctx: PluginContext): Promise<void> {
  registerExposurePremises()
  registerExposureApi(ctx)
  registerExposureSceneLogic(ctx)
  // 注释：加载期卫生检查——无任何 has_indoor 地点 → warning（露出模式 1 不可达）
  checkIndoorTagCoverage()
}
