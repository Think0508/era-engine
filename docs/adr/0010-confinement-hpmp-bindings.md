# 监禁系统：hp/mp 经绑定系统读取（ADR 0010）

2026-08-14 决策。复刻 erArk 监禁系统时，逃脱对抗公式（有监狱长时）需要囚犯与监狱长的 hp/mp 百分比（erArk `judge_can_escape` :105-114：`escape_value = (概率/100)×(条件+1)×0.4×战斗×(hp/100)×(mp/100)`）。

## 背景

架构铁律：插件代码禁止硬编码属性名（如 `'体力'`），必须走 `ctx.api.call('engine', 'bindings.get/set', ...)` 或绑定系统。监禁系统需要读两个数值型属性（hp/mp），但具体属性名由 mod 定义（武侠 mod 可能叫「气血/内力」，其他世界观完全不同）。

## 决策

- confinement-system 在 `plugin.toml` 声明 `required_attributes: { hp, mp }`（type=number）
- mod 在 `bindings.toml` 的 `[bindings.confinement-system]` 段绑定：`hp = "气血"`、`mp = "内力"`
- 代码读取用 `bindingResolver.getForPlugin('confinement-system', charId, 'hp')`（只读自己的绑定，避免与其他插件同名键冲突——follow-system 同款先例）
- 未绑定 → 加载期 error（required_attributes 语义，阻止加载）；运行时读取失败 → 按 100（中性值）处理，不报错

## 备选方案

1. 直接读 `entity.base['体力']` —— 违反「属性名禁止硬编码」铁律，否决
2. 硬编码绑定键名进引擎 core —— 违反「core 不认知任何属性名」，否决

## 影响

- mod 必须为启用 confinement-system 的 mod 提供 hp/mp 绑定（test-mod 已绑定：hp="hp"/mp="mp"）
- 绑定校验失败信息明确：插件 `confinement-system` 需要 `hp`，请检查 `bindings.toml`
