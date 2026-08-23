# 通用口上编辑器（tools/talk-common-editor）

维护 era-engine 通用口上（talk-common behavior 轨）的本地桌面工具（Tauri v2 + Vue 3）。
**不是游戏本体**：只读写工作区源码文件，从不干预游戏进程。

## 三条数据路径

| 路径 | 选中物 | 维护物 | 文件位置 |
|------|--------|--------|----------|
| 默认层（原生） | 原生指令 | 通用默认口上 | `src/plugins/talk-common-system/data/default/talk-common/behavior/**` |
| mod 覆盖层 | 原生指令 + 选 mod | mod 版口上（保存时自动建文件，种子 = 默认层全文副本） | `mods/{mod}/definitions/talk-common/behavior/**` |
| mod 指令 | mod 引入的指令 | mod 版口上（种子 = 空骨架） | 同上 |

## 运行

```bash
cd tools/talk-common-editor
npm install
npm run tauri dev      # 桌面窗口（推荐）
# 或纯 UI 预览（无写盘能力）：npm run dev → http://localhost:1421
```

启动后点「选择工作区根目录」指向 era-engine 仓库根（`C:\Users\d\Documents\era-engine`）。

## 测试与构建

```bash
npm run test    # vitest（scan/validate/seed/preview/encoding/diff）
npm run build   # vue-tsc 类型检查 + vite 构建
cd src-tauri && cargo check   # Rust 壳编译检查
```

## 关键行为

- **整文件纯文本编辑**（CodeMirror 6，TOML 高亮/行号/Ctrl+F），永不做 parse→stringify：注释、分组分隔线、多行字符串原样保留。
- **编码契约**：UTF-8 无 BOM + LF（仓库现状）；原文件带 BOM 则写回时保留；EOL 不归一化。
- **校验（保存前）**：TOML 语法（报行号，点击跳转）→ 结构（variable/entries/context，对齐引擎丢弃判据）→ `premise(X)` 引用（best-effort 白名单，警告级）→ `{word}`/`{obj.prop}` 插值变量（提示级）。深度条件校验由引擎加载期负责。
- **variable 防误改**：与预期不符 → 错误 + 一键修复提示（引擎按 variable 键整体覆盖，失配即断链）。
- **未保存守卫**：切文件/切模式/关窗拦截；草稿自动存 localStorage，重开自动恢复。
- **外部修改冲突**：保存前回读磁盘，若与打开时基线不同 → 弹窗确认覆盖；可用「重载」按钮改读磁盘最新内容。
- **整体修饰（ADR 0018）**：行为词条的 `style/trigger/display/speed/pause/color/size/font` 字段——校验（类型/枚举 warning、style 名注册表 hint）+ 预览应用（查插件默认层基座 + 目标 mod 的 `[styles]`：颜色/字体/字号生效，节奏标徽标如 `逐字40ms`/`点击继续`）；
- **H 轨（action_A/body/body_part/unconscious_semen）**：本期不编辑，但 `{word}` 词表来自 body/body_part 变量，作为校验参照。

## 已知取舍

- 新建文件后游戏 dev 需重启（Vite glob 启动时扫描）；改已有文件 HMR 即时生效。
- 打包 exe 不读盘上文件：工具定位 = 改源码 + dev 预览工作流。
- mod 覆盖 = 引擎级整体替换语义（无条目级合并）：mod 文件是独立全文。