# Task H.2：h-ejaculation 插件

> 射精积累/忍耐/射精量/精液追踪/精液吸收

## 文件
```
src/plugins/h-ejaculation/
├── plugin.toml
├── index.ts
└── h-ejaculation.test.ts
```

## 实现

### plugin.toml
id="h-ejaculation", depends_on=["h:ready"]

### index.ts
onLoad():
- 注册 eja_add effect: 每次 P 部位行为 eja += 100 + int(eja×0.4)
- 注册 eja_climax effect: 绝顶触发时调，处理 P 部位射精
- 注册 eja_shoot effect: 实际射精量计算

onEnable():
- 注册 eja API: getEja/setEja/climax/shoot
- 精液追踪 API: getSemenOnBody/getSemenOnCloth/absorbSemen
- 监听 game:hour_changed → 精液吸收（按时间衰减）

### 射精量计算（公式#10）
semen_count = base_semen × random(0.8,1.2) × 叠加倍率
- base_semen: small=10, normal=20, strong=50
- 叠加倍率: 第一发×2, 精力剂×2, 精液积攒×2, 浓厚精液×2
- 上限 min(semen_count, semen_point)

### 精液追踪
角色 body_semen: Map<部位ID, [量, 等级, 累计量]>
角色 cloth_semen: Map<服装槽ID, [量, 等级, 累计量]>
吸收: 调 hour_changed 时的衰减

### 测试
积累/射精量/追踪/吸收
