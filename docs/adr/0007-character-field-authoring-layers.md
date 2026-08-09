# 角色字段作者分层（L1/L2/L3）：谁有权在角色数据里写什么

2026-08-09 决策。标准角色契约（spec §10.1，`docs/character-schema.md`）的字段分类此前只有「属性类别（category）」「最小必需集」「可删性」三个维度，缺少「作者写入层」维度——mod 作者写角色/模板时不知道哪些字段该写、哪些是引擎内部结构（写了无效/被重写）。本决策新增第四个维度：**作者写入层**。

## 三层定义（正交于 category）

| 层 | 语义 | 典型成员 |
|----|------|----------|
| L1 角色层 | mod 写角色/模板时直接合理写入，初始值有意义 | id/name、base、abilities、talents、experience（数值）、first_times.virgin_*、status_effects（初始）、relations、inventory、equipment、assets、behavior、current_location（初始）、dead、pregnancy.*、marks（归一化） |
| L2 非平凡 | 合法但罕见：需插件声明或动全局默认 | sp_flag（自定义 flag 需插件声明）、自定义顶层键（需插件声明）、params（daily_reset，初始值仅首日意义） |
| L3 引擎独占 | 系统运行时管理，写入无效/被重写 | h_state、body_items、first_records、dirty、hypnosis、action_info、achievement、equipment_off/visible/blood |

判据：引擎会**重置/接管**（写了无意义）→ L3；引擎只**累加/尊重初值** → L1；其余按平凡度分 L1/L2。

## 四个纠缠子决策

1. **marks 写入归一化**：刻印真相源是 `entity.abilities.{刻印名}`（attributes.toml category=mark 仅是条件字典镜像，零读零写）。角色数据写 `marks = {...}`（值 >0）在 finalizeCharacterData 时拷入 `abilities.{刻印名}.level`（两者都写则 abilities 优先）。§2.3「禁止写 marks」约束引擎/插件运行时，不约束 mod 角色数据入口。
2. **params 归 L2**：全部 `daily_reset = true`（睡眠结算清零），初始值只有首日意义，mod 正常不写。
3. **experience 归 L1**：数值 id 字典（部位/绝顶/体位经验），初始写入有意义（如 熟女角色）；键名禁改是文档约定（无定义文件可机器校验）。
4. **处女天赋双源修复**：h-first-time 破处时同步删对应天赋（V→阴道处女、A→肛门处女、U→尿道处女、W→子宫处女、初吻→无接吻经验）——否则 talk-common 口上条件 `talents.肛门处女 == 0` 破处后永久失效。

## 落地

- 分层表放 `src/core/character-contract.ts` 静态表，`validateCharacterContract` 做顶层键检查：L3 命中 → warning「引擎独占，写入无效」；L2 命中 → warning「非平凡字段，若确需请经插件声明/definitions 改默认值」
- 权威文档：`docs/character-schema.md` §11 字段分层表；`docs/mod-author-guide.md` 速查改分层视角
- 审计结论：pregnancy 初始值不被 h-pregnancy 重置（L1 成立）；预置 virgin=true 不自动生成 first_records（文档说明）

## 权衡

曾考虑纯文档不校验（太弱，h_state 禁令此前就是文档约束）；曾考虑 attributes.toml 加 `exposure` 元数据字段（过度——分层主要是命名空间级，属性级几乎全 L1）；曾考虑 marks 维持无效 + warning 引导写 abilities（拒绝——刻印 UI 分组就叫「刻印」，mod 作者按直觉写 marks 不该踩警告）。

Status: accepted
