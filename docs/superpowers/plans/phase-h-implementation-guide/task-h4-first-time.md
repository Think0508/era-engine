# Task H.4：h-first-time 插件

> 第一次系统——处女/初吻等

## 文件
```
src/plugins/h-first-time/
├── plugin.toml
└── index.ts
```

## 实现

### plugin.toml
id="h-first-time", depends_on=["h:ready"]

### index.ts
onLoad():
- 注册 first_time_check effect: 判定是否是第一次行为

onEnable():
- 注册 first-time API: isVirgin/getFirstTimeFlags/setFirstTime
- 6 种处女类型（V/A/U/W/M/其他）
- 实行惩罚: 首次剧痛公式（苦痛大幅增加）
- 初吻/初次牵手等标记
- first_time_flags: Record<string, boolean>（如 first_kiss, first_sex_V 等）

### 测试
判定/惩罚/标记
