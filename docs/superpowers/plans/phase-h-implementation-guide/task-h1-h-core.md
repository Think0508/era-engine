# Task H.1：h-core 插件核心

> 实现前提系统、结算公式、实行判定、h_state、绝顶判定、指令加载。

## 文件清单

```
src/plugins/h-core/
├── plugin.toml              # meta + data_dependencies
├── index.ts                 # onLoad/onEnable 入口
├── types.ts                 # H_STATE / 内部接口
├── h-instruction-loader.ts  # 加载 h-instructions TOML → CommandRegistry
├── premise/
│   ├── premise-registry.ts  # 前提注册表
│   ├── premise-h.ts         # H 状态前提
│   ├── premise-target.ts    # 目标前提
│   ├── premise-fall.ts      # 陷落前提
│   └── premise-clothing.ts  # 服装前提
├── settle/
│   ├── favorability.ts      # 好感度结算（公式#1）
│   ├── trust.ts             # 信赖度结算（公式#2）
│   ├── judge.ts             # 实行判定（公式#3）
│   ├── state.ts             # 状态值变化（公式#8）
│   ├── orgasm.ts            # 绝顶结算（公式#9）
│   ├── experience.ts        # 经验结算（公式#12）
│   └── hp-mp.ts            # HP/MP 变化（公式#7）
└── h-core.test.ts           # 测试
```

## 实现步骤

### 1. plugin.toml
id="h-core", data_dependencies provides="h:ready", depends_on=["effects:ready","status:ready","dialogue:ready","characters:initialized"]
condition_fields: "h.in_progress"(boolean), "selected.h_status.{statusId}"(number)

### 2. types.ts
- H_STATE 接口：insert_position, current_sex_position, orgasm_count, orgasm_level, orgasm_edge, endure_not_shoot_count, shoot_semen_amount, just_shoot, bondage_type, condom_count, is_h
- 引用 mod-loader 的 HInstruction 接口（或保持兼容）

### 3. premise/premise-registry.ts
Class PremiseRegistry:
- register(id: string, handler: (ctx: any) => boolean | number)
- evaluate(premises: string[], ctx: any): boolean
- clear(): void
handler 签名: 接收 ctx（含 uiStore/gameStore/entitySystem），返回 boolean 或 number(>0=true)

### 4. premise/premise-h.ts
注册到 PremiseRegistry：
- HAVE_TARGET: ctx.selectedCharacterId != null
- NOT_H: 目标 h_state?.is_h != true
- IS_H: 目标 h_state?.is_h == true
- T_NORMAL: 目标无异常状态（status_effects 不含禁锢等）
- SCENE_ONLY_TWO: 当前地点角色数 ≤2
- TIRED_LE_74: 选的角色疲惫（strength/hp）≥ 某个比例

### 5. premise/premise-target.ts
- SELECTED_EXISTS = HAVE_TARGET
- SELECTED_NORMAL = T_NORMAL

### 6. premise/premise-fall.ts
FALL_LEVEL_GE_1/2/3/4: 查角色 talents 有爱情系(201-204)或隶属系(211-214)，有则对应等级

### 7. premise/premise-clothing.ts
- CLOTH_OFF: 目标全部 equipment 为空
- NOT_WEAR_PAN: 目标 lower_body 槽为空
- BRA_VISIBLE: 目标 upper_body 可见

### 8. settle/favorability.ts → calcFavorability()
公式#1: floor(base × status_adjust × ability_adjust × talent_adjust × mark_adjust)
- status_adjust 从各状态值等级取 ±10%/lv
- ability_adjust 从能力等级取 ±20%/lv
- mark_adjust 从刻印等级取 ±20%/lv
- talent_adjust 从陷落链取 ±25%/lv
- 全部系数累加后与 1.0 相加（如恭顺LV3=+30%，1.0+0.3=1.3）

### 9. settle/trust.ts → calcTrust()
公式#2: base = behavior_duration_min/60，修正体系同好感度

### 10. settle/judge.ts → calcJudge()
公式#3: 实行值 = judge_base + 好感等级修正 + 信赖等级修正 + 状态修正 + 陷落修正 + 能力修正
- 对照 h-config 的 favorability_thresholds / trust_thresholds 算等级
- 状态修正表看 erArk 公式手册公式#3
- 返回 { success: boolean, partial: boolean, retreated: boolean }

### 11. settle/state.ts → stateChange()
公式#8: floor(base × 能力修正 × 状态相互修正)
- 用 bindingResolver.set(id, attr, current + delta)
- 欲情↑ → 快乐联动，苦痛↑ → 恐怖+屈服联动
- 能力修正: getAbilityAdjust(level) 查 hConfig.ability_lv_adjust

### 12. settle/orgasm.ts → checkOrgasm()
公式#9: 部位快感 >= level_thresholds[10] → 绝顶触发
- 强度轮换: orgasm_level[partId]%3
- P部位→特殊处理（调 ejaculation API TODO）
- emit 'h:orgasm' 事件

### 13. settle/experience.ts → gainExperience()
直接存角色 experience 字段（不经 binding）

### 14. settle/hp-mp.ts → changeHpMp()
直接加减 bindingResolver 的体力/气力

### 15. index.ts
onLoad():
- 注册 effect types 到 effectTypeRegistry
- h_state_change → stateChange
- h_hp_mp_change → changeHpMp
- h_favorability → calcFavorability
- h_judge → calcJudge
- h_start_h → initHState + enterMode('h_scene') + emit 'h:start'
- h_end_h → endHState + popMode + HP成长 + emit 'h:end'
- h_orgasm_check → checkOrgasm
- h_experience → gainExperience

onEnable():
- 注册 API: calcFavorability/calcTrust/calcJudge/stateChange/checkOrgasm/gainExperience/evaluatePremises/getAbilityAdjust/getLevel/initHState/endHState
- premiseRegistry 注册所有前提 handler
- 调 h-instruction-loader 注册指令到 CommandRegistry
- 注册 do_h/end_h 指令
- 清理 native-commands 的 H 占位

### 16. h-instruction-loader.ts
从 modLoader.getMod()?.hInstructions 读取 → 逐条转 CommandDef → commandRegistry.register
- daily/obscenity 指令 modes=["exploration"]
- sex 指令 modes=["h_scene"]
- condition 设 premiseRegistry 求值字符串（如 "premises:HAVE_TARGET,NOT_H"）

### 17. h-core.test.ts
- 前提各 handler 正确返回
- calcFavorability 公式正确
- calcJudge 三选一
- stateChange 修改角色属性
- checkOrgasm 绝顶触发
- startH/endH 生命周期
- h-instruction 注册到 CommandRegistry 正确
