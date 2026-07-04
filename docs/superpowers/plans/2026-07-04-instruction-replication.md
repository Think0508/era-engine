# 指令复刻实现方案

> 精确复刻 erArk 全部指令（408 条中 ~380 条可用）。效果 + 前提 + CVE(condition字段替代) + 数据。

---

## Phase A: 前提补齐（~80 个）

### A1: 身体/体技/体位前提
- `TARGET_HAVE_HORN/TAIL/WING/RING/TENTACLE/CAR` — 检查角色是否有对应身体特征
- `TARGET_TECHNIQUE_GE_{3,5,7}` / `FINGER_TECHNIQUE_GE_{3,5}` / `WAIST_TECHNIQUE_GE_{3,5,7}`
- `DR_POSITION_NULL/NORMAL/BACK/FACE_RIDE/BACK_RIDE/FACE_SEAT/BACK_SEAT/FACE_STAND/BACK_STAND/FACE_HUG/BACK_HUG/FACE_LIE/BACK_LIE`
- `DR_HAVE_SEX_POSITION` / `PENIS_IN_T_VAGINA_OR_WOMB` / `PENIS_IN_T_ANAL` / `PENIS_IN_T_WOMB` / `PENIS_IN_T_URETHRAL` / `PENIS_IN_T_MOUSE`
- `TARGET_A_EMPTY` / `T_U_DILATE_GE_{2,3,5}` / `T_W_DILATE_GE_{3,5}`

### A2: 服装/地点/道具前提
- `TARGET_WEAR_SKIRT/PAN/SOCKS/HAT/GLASS/IN_EAR/IN_NECK/IN_MOUSE/BRA/GLOVES/TROUSERS/SHOES`
- `IN_BATHROOM/PRISON/KITCHEN/LIBRARY/GYM/H_SHOP/TOILET_MAN/LOVE_HOTEL` 等
- `PLACE_FURNITURE_GE_{1,2,3}` / `PLACE_DOOR_LOCKABLE/OPEN/CLOSE`
- `HAVE_{BONDAGE/VIBRATOR/PHILTER/CONDOM/LUBRICANT/PATCH/GAG/WHIP/CANDLES/CLYSTER/MILKING_MACHINE/URINE_COLLECTOR/COTTON_STICK/LOVE_EGG/NIPPLE_CLAMP/CLIT_CLAMP/ANAL_BEADS/ENEMAS/PILL/SLEEPING_PILLS/DIURETICS/CLOMID}`

### A3: 杂项前提
- `T_LACTATION_1` / `T_INFLATION_1` / `T_CHILD_OR_LOLI_1`
- `T_MILK_GE_30` / `T_URINATE_GE_80` / `NOW_CONDOM/NOT_CONDOM`
- `LAST_CMD_NORMAL_SEX` 等
- `T_NPC_ACTIVE_H` / `T_NPC_NOT_ACTIVE_H`
- `TARGET_NOW_SEX_TOY_ON/OFF/WEAK/STRONG`
- `TARGET_NOT_VIBRATOR_INSERTION` / `TARGET_NOW_VIBRATOR_INSERTION`
- `T_NOT_ENEMA` / `T_ENEMA` / `T_ENEMA_CAPACITY_L_5`
- `DEBUG_MODE_ON/OFF`

---

## Phase B: 效果补齐（逐步注册 missing effect types）

核心策略：用 `settle_state` 覆盖大部分状态值效果，用 `set_field` 覆盖 flag 类效果，用 `modify_attribute` 覆盖属性类效果。

待注册的类型将在各 batch 内逐条从 `default.py` 读取 base_value 后批量创建。

---

## Phase C: 指令 TOML 数据

按子系统分批：DAILY → WORK → PLAY → ARTS → OBSCENITY → SEX(FOREPLAY/WAIT_UPON/INSERT/ITEM/DRUG/SM/BASE)

每个指令 TOML 格式：
```toml
[[instructions]]
id = "touch_head"
label = "摸头"
type = "obscenity"
time_cost = 10
judge_base = 200
premises = ["HAVE_TARGET", "NOT_H", "T_NORMAL_56_OR_UNCONSCIOUS_FLAG", "TIRED_LE_84", "HP_G_1"]
effects = [
  { type = "settle_favorability" },
  { type = "settle_state", params = { state = "体力", baseValue = 30, negate = true } },
  { type = "settle_state", params = { state = "气力", baseValue = 30, negate = true } },
  { type = "settle_trust" },
  { type = "settle_state", params = { state = "敬意", baseValue = 30 } },
  { type = "settle_state", params = { state = "好意", baseValue = 30 } },
  { type = "settle_state", params = { state = "屈服", baseValue = 30 } },
  { type = "settle_state", params = { state = "润滑", baseValue = 30 } },
  { type = "settle_state", params = { state = "苦痛", baseValue = 30 } },
  { type = "settle_state", params = { state = "经验", baseValue = 1 }, condition = "player.experience.stroke >= 1" },
]
```
