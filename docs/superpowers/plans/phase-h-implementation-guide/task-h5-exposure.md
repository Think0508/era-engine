# Task H.5：h-exposure 插件

> 露出系统——4 级露出模式/被发现处理

## 文件
```
src/plugins/h-exposure/
├── plugin.toml
└── index.ts
```

## 实现

### plugin.toml
id="h-exposure", depends_on=["h:ready"]

### index.ts
onLoad():
- 注册 exposure effect types + 通过 h-core 的 premiseRegistry 注册露出前提 handler
- premise: IS_EXPOSURE_MODE / EXPOSURE_LEVEL_GE_1 等

onEnable():
- 注册 exposure API: getExposureLevel/setExposureMode/switchMode
- 4 级露出模式: 0=正常, 1=轻度露出, 2=中度露出, 3=重度露出
- 动态切换（场景条件满足时）
- 被发现处理: NPC 目睹暴露 → 事件 + 口上
- 露出中羞耻/快感生成效率修正
- 注册露出相关指令

### 测试
模式切换/被发现
