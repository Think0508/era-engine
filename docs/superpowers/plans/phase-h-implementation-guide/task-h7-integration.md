# Task H.7：集成测试 + 文档更新

## 集成测试
建 `src/plugins/phase-h-integration.test.ts`，测全流程：
1. 聊天指令 → 好感度涨
2. 接吻 → 情欲/屈服涨
3. H 邀请 → h_state 初始化 + pushMode('h_scene')
4. H 内行为 → 状态值变化
5. 绝顶触发 → orgasm_count 涨
6. 射精 → 精液追踪
7. 结束 H → h_state 重置 + HPMP 成长
8. 睡眠 → 刻印升级检测

## 文档更新
- `docs/developer-handbook.md`: Phase H 标记 ✅，加新插件列表
- `docs/mod-author-guide.md`: H 指令写法的说明（h-instructions/ + h-config.toml + attributes level_thresholds）
- `docs/plugin-author-guide.md`: H 子系统插件开发模式（premiseRegistry + h-core API）
- `CONTEXT.md`: 加 H 相关术语（H_STATE / Premise / 刻印等）

## 验证
```bash
npm run typecheck && npm run test
npm run dev  # 目视
```
