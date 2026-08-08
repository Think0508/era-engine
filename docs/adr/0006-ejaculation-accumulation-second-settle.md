# 射精欲积累：对齐 erArk 现行二段结算机制（per-character 泛化）

2026-08-08 决策。原实现把射精欲积累内联在 tech_adjust/settle_state 的阴茎快感结算处，公式 `(time+50) × 技巧系数 + 阴茎快感/8`，注释引用的源码行号（default.py:8304）实际指向无关代码（TARGET_V_ADJUST_ADD_PAIN 内部）——来源不明的自创公式。

核实 erArk 三个候选公式后决策：
- **采用**：二段结算 ADD_SMALL_P_FEEL（Second_effect.py:657-679 + 04-射精系统.md:50-54）——每次 P 部位快感产生时 `eja_point += 100 + int(eja_point × 0.4)`。这是 fork 现行设计（TECH_ADD_P 的 sqrt 公式已标"已弃用"，constant_effect.py:211）
- **泛化**：fork 硬编码玩家（character_data[0]），引擎按"自己产生 P 快感的角色"累积（per-character）——与引擎 eja_climax 的通用性一致（任何角色可射精），代码注释说明差异
- **落点**：orgasm.ts orgasmJudge 顶部读 pending_orgasm_feel[3]（清空之前），经 h-ejaculation 公共 API 写入（跨插件唯一通信路径），h-core 不再直接碰射精欲字段
- 120/141-146（PL_P 系列）与 70/44（ADD_SMALL_P_FEEL 第一效果）的射精欲公式各有独立 effect 类型（pl_p_adjust/eja_add/eja_add_target），与本机制并存不冲突

权衡：曾考虑保留原内联公式（改注释了事），因公式无源码依据、且与 erArk 行为（100+0.4eja）数值差异显著而否决；曾考虑仅玩家积累（严格对齐 fork），因引擎数据模型已支持任意角色射精而否决。

Status: accepted
