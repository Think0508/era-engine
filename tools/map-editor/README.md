# map-editor

era-engine 的可视化地图编辑器：编辑地点拓扑（`locations/*.toml`）、邻接图（`graph/*.toml`）和视觉地图（`layout/*.json`）。

## 开发运行

```bash
cd tools/map-editor
npm install
npm run tauri dev   # 桌面应用（Tauri）
# 或纯浏览器调试：
npm run dev
```

## 测试 / 构建

```bash
npm test        # Vitest
npm run build   # vue-tsc 类型检查 + Vite 构建
```

## 快捷键

| 操作 | 按键 |
|---|---|
| 新建根节点 | 双击画布空白处 |
| 新建子节点 | 选中节点后 `Tab` |
| 重命名 | `F2` / 双击节点 / `Space`（Enter 提交，Esc 取消） |
| 删除节点/边 | `Delete` / `Backspace`（节点删除会确认） |
| 多选 | `Shift`/`Ctrl`/`Cmd` 单击节点 |
| 撤销 / 重做 | `Ctrl+Z` / `Ctrl+Shift+Z` 或 `Ctrl+Y` |
| 折叠/展开 | 右键节点 → 折叠/展开 |
| 聚焦子树 | 右键节点 → 聚焦到此节点；面包屑返回 |

## 数据格式

- **模式 A（拓扑）**：导出 `maps/locations/*.toml` 与 `maps/graph/*.toml`
- **模式 B（视觉）**：每张视觉地图跟随“面包屑/焦点”独立保存背景图、节点坐标与点击区域
  - 主地图（未聚焦）导出时需指定一个地点 ID
  - 聚焦到某地点后，该地点的视觉子地图导出为 `maps/layout/{地点ID}.json`
  - “导出全部 Layout”会一次导出所有已配置背景图的视觉地图
- **项目文件**：`.mapedit`（JSON，v3，保存画布 viewport、背景图与全部视觉地图上下文）

## 已知范围

- 子地图使用“单画布 + 面包屑聚焦”模式，不做多画布。
- 路径编辑当前以侧栏数值控制点为主，画布可视化路径编辑尚未实现。