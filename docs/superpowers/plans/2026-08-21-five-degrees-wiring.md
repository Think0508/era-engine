# 实施计划：五度属性机制通电小步（2026-08-21）

> **目标**：把「五度属性」的**机制**落地——3 个新属性声明 + 统一累加通道 + 桥 effect——使其可被指令写入、可被条件引用。
> **不含**：任何数值规律、换算系数、镜像挂钩、内容层指令集（全部仍挂 TODO，见 §边界）。
> 设计依据：`docs/five-degrees-attributes.md`（grill 裁定，勿偏离）；登记：`docs/master-todo.md` L3 推迟池。

---

## 一、决策输入（grill 定稿，实现时不再改动）

| 维度 | 裁定 |
|------|------|
| 属性归层 | **h-core 插件默认层**（`src/plugins/h-core/data/default/attributes.toml`），与 好感度/信赖度 同层 |
| 桥形态 | **专属 effect**，统一走一个代码里的累加函数（单一累加通道） |
| 供电时机 | 本轮**只做通道**（效果能加固定数）；settle 镜像挂钩、`combat:end` 挂钩全部留 TODO |
| 条件路径 | **声明即注册**（attributes.toml 一进去，条件字典立即有 `character.{id}.屈服度` 等） |
| 单调性 | 3 个新度**只增不减**；负值入参 → warning + 丢弃 |
| 数值规律 | **全部留下轮**：无换算系数（恒 1 占位）、无 cap、无阈值表 |

其余 8 条机制锚点见设计文档 §三（social 权威 / 独立平行 / 刻印不动 / 公式走专属 effect 等），本计划不复述。

## 二、验收标准（成功证据）

1. **属性就位**：角色构建后 `entity.social` 含 屈服度/软弱度/欲望度 = 0（`applyAttributeDefaults` 自动补）。
2. **效果可写**：`accumulate_degrees` 对 `_targetIds` 一次性累加多度；固定数生效；负值入参不扣减、发一次 warning。
3. **单调性**：3 个新度只增不减（负值等价 no-op）。
4. **条件可引用**：`selected.屈服度 >= N` 通过 condition-registry 校验；效果累加后求值为真。
5. **不污染 UI**：3 属性 `display=false`，属性面板不显示。
6. **无回归**：全量 `vitest`（现 1040+ 用例）通过；h-core 必需集校验器不受影响（3 属性不在必需集）。
7. **文档同步**：effect 表登记 `accumulate_degrees`；master-todo L3 通电小步标记完成；设计文档 §六写入"本步已通电"。

## 三、改动分组

### G1 属性声明
`src/plugins/h-core/data/default/attributes.toml`（social 段，好感度/信赖度旁新增）：
```toml
"屈服度" = { type = "number", default = 0, category = "social", display = false }
"软弱度" = { type = "number", default = 0, category = "social", display = false }
"欲望度" = { type = "number", default = 0, category = "social", display = false }
```
- 不加 cap / 不加 `level_thresholds`（数值规律下轮定）。
- 不做 ATTR 常量（度名是数据，由 TOML effect 传入，代码不写死中文属性名字面量）。

### G2 统一累加通道
新建 `src/plugins/h-core/settle/degree.ts`：

- `accumulateDegree(char, degree, amount): void` —— 唯一个累加点：
  - 单调钳制：`amount < 0` → 调用方自行拦截，本函数只累加非负值；
  - 换算系数槽：`const conversion = DEGREE_CONVERSIONS[degree] ?? 1`（`DEGREE_CONVERSIONS = {}` 现恒 1，**注释 TODO：性格系数/数值规律**）；
  - `char.social[degree] = (char.social[degree] ?? 0) + floor(amount × conversion)`；emit `character:changed`（payload `{ id }`）。
- 命名空间按 `attributes.toml` category 动态解析（与 binding-resolver 对 social 的处理一致；仅写 social，不写 base）。

> 设计意图：将来 settle 镜像挂钩 / `combat:end` 挂钩 / 性格系数全部只调这一个函数 → 桥 = 单一通道，作者零散写。

### G3 效果注册
新建 `src/plugins/h-core/effects/degree-effects.ts`，仿 `settle-effects.ts` 模式：

```ts
export function registerDegreeEffects(): void {
  effectTypeRegistry.register('accumulate_degrees', async (_p: any, execCtx: any) => {
    // targetIds = execCtx._targetIds；缺目标 → fail-closed warning（对齐 judge_check）
    // for ([degree, value] of Object.entries(_p.degrees ?? {})):
    //   value < 0 → errorReporter.warning（单调铁律，不扣减）跳过
    //   degree 不在 mod.attributes（social）→ warning 跳过（防拼错静默）
    //   else accumulateDegree(char, degree, floor(value))
  })
}
```
- `index.ts` 导入并调用：`import { registerDegreeEffects }` … 在现有 `registerSettleEffects()` 同处接线。
- 注册前 `grep accumulate_degrees` 确认名字未被占用。

### G4 测试
新建 `src/plugins/h-core/degree-effects.test.ts`（沿用项目 makeChar/effect-loader 风格）：
1. 属性默认 0 落 `social`（3 个）；
2. `accumulate_degrees` 单目标/多度累加正确；
3. 负值入参 → 该度不变 + warning 计数 1；
4. 未定义度名 → warning + 无崩溃；
5. `selected.屈服度 >= 10` 条件校验通过 + 累加后求值翻转；
6. `character:changed` 触发。

### G5 文档
- `docs/mod-author-guide.md` effect 表：新增 `accumulate_degrees`（`params.degrees` 地图，单调只增）。
- `docs/effect-system.md`（如有效果类型表）同步登记。
- `docs/master-todo.md` L3 通电小步：标注"机制通电（2026-08-21）✅，数值/内容仍 TODO"。
- `docs/five-degrees-attributes.md` §六：补一行"本步已通电：属性声明 + `accumulate_degrees` 通道可用（2026-08-21）"。

### G6 验证
- `npm run typecheck` 干净。
- `npx vitest run src/plugins/h-core/degree-effects.test.ts` 绿。
- 全量 `npx vitest run` 无回归（1040+ 通过）。
- 条件手册核对：`player.屈服度` / `character.{id}.屈服度` 等登记为 number。

## 四、边界（明确不做，留给下一计划）

- ❌ settle_state 镜像挂钩（屈服度 = 发射流镜像账）——等数值/性格系数那轮。
- ❌ `combat:end` 软弱度挂钩。
- ❌ 换算系数 / caps / 阈值表 / `level_thresholds`。
- ❌ 角色性格系数系统。
- ❌ 内容层：威胁 / 绑架 / 哄骗 指令集及其 前提/结算/后果/失败路径。
- ❌ 不动 h-mark、不动 settle_state 管线、不动 relation-system。

## 五、风险与缓解

| 风险 | 缓解 |
|------|------|
| h-core 默认层新增属性影响所有 mod | `display=false` 不占 UI；不在 h-core 必需集；角色数据没写 = 默认 0；跑全量回归 + 条件手册核对 |
| effect 命名冲突 | 注册前 `grep accumulate_degrees` 全库确认 |
| 单调钳制的"负值"歧义（未来要不要扣减） | 本轮契约写死：负值 warning + 丢弃；将来要扣减走新 effect 或显式 ADR，不偷改本 effect |
| 拼错的度名静默 0 | handler 内校验度名 ∈ `mod.attributes`（social），拼错 warning |

## 六、产出物清单

> ✅ **全部完成（2026-08-21）**：typecheck 干净 / scan-attr-refs 0 违规 / 全量 81 文件 1082 用例通过（含本计划新增 7 用例）。
> 数值规律 / settle 镜像挂钩 / 内容层指令集按 §四 边界仍未做（留 TODO）。

- [x] `src/plugins/h-core/data/default/attributes.toml` +3 行
- [x] `src/plugins/h-core/settle/degree.ts`
- [x] `src/plugins/h-core/effects/degree-effects.ts` + `index.ts` 接线（含 h-core API `accumulateDegree`）
- [x] `src/plugins/h-core/degree-effects.test.ts`
- [x] `docs/mod-author-guide.md` / `docs/effect-system.md` effect 表
- [x] `docs/master-todo.md` / `docs/five-degrees-attributes.md` 状态更新
- [x] typecheck + 全量测试绿
