# h-hypnosis 第二阶段实现方案

**Goal:** 玩家催眠天赋 + NPC 催眠天赋 + 角色扮演系统

---

### Task A: 玩家催眠天赋 + 精神力资源

- 精神力 `base['精神']` — 最大 100，每日恢复满
- 催眠经验 `experience.hypnosis` — 每次成功催眠 +1
- 阈值: 1→331, 10→332, 50→333, 200→334
- 前提 `PRIMARY/INTERMEDIATE/ADVANCED/SPECIAL_HYPNOSIS` 改为检查天赋字段
- `hypnosis_one` 效果消耗精神力 + 加经验

### Task B: NPC 催眠天赋 + 完成检查

- `checkHypnosisCompletion` 完整实现:
  - 程度 ≥ 50 → 获得天赋 71
  - 程度 ≥ 100 → 获得天赋 72
  - 程度 ≥ 200 → 获得天赋 73
- 第一次获得天赋时触发二段行为 (narrativeLog)
- `calculateSanityCost` 使用 NPC 天赋 71/72/73

### Task C: 角色扮演数据 + 前提

- 40+ roleplay ID 定义 (硬编码数据，不依赖 TOML)
- 每个 ID: `{ id, name, type, subType, info }`
- 5 类: 家庭/职业/关系/人外/场景
- 前提 `T_HYPNOSIS_ROLEPLAY_N` (N=1~6) 检查 `roleplay.includes(N)`
- 选择面板 UI 插槽 (TODO)
