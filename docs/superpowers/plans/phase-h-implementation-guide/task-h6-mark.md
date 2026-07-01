# Task H.6：h-mark 插件

> 刻印系统——7 种刻印升级/降级/修正查询

## 文件
```
src/plugins/h-mark/
├── plugin.toml
└── index.ts
```

## 实现

### plugin.toml
id="h-mark", depends_on=["h:ready"]

### index.ts
onEnable():
- 注册 mark API: getMarkLevel/checkMarkUp/markDown/initMarks
- 监听 game:new_day（睡眠结算时检测刻印升级）
- 7 种刻印: 快乐(13)/屈服(14)/苦痛(15)/时姦(16)/恐怖(17)/反发(18)/无觉(19)，等级 0-3

### 升级条件
- 快乐: 单次H绝顶≥2→LV1, ≥8→LV2, ≥16→LV3；累计≥5→LV1, ≥20→LV2, ≥50→LV3
- 屈服: 屈服值≥30000/50000/100000
- 苦痛: 苦痛值(权重×5)≥20000/40000/80000
- 其他见 erArk 刻印系统文档

### 降级
非快乐/非屈服类刻印可降级（满足条件时消耗一定值）

### 测试
升级/降级/查询
