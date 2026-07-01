# Task H.3：h-pregnancy 插件

> 受孕判定/孕期推进/泌乳

## 文件
```
src/plugins/h-pregnancy/
├── plugin.toml
└── index.ts
```

## 实现

### plugin.toml
id="h-pregnancy", depends_on=["h:ready"]

### index.ts
onLoad():
- 注册 pregnancy_check effect: 精液在体内 + 非避孕时间 → 概率判定

onEnable():
- 注册 pregnancy API: isPregnant/getPregnancyStage/getDaysPregnant
- 监听 game:new_day → 推进孕期天数
- 7 阶段孕期跟踪（每阶段约 30 天）
- 泌乳触发（孕期特定阶段）
- TODO(phase-11+): 女儿成长完成后作为自订角色入口

### 受孕判定
条件：精液在体内 + 排卵期 + 未避孕 → 乱数判定
角色 pregnancy 字段: { stage, daysPregnant, hasGivenBirth }

### 测试
受孕/孕期推进/泌乳
