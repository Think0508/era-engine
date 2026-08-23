// 展示样式工具（2026-08-23 收敛）：size 名 → CSS 的唯一映射
// 此前 NarrativeLog / FullscreenOutput 各复制一份三元表达式，且 typewriter 分支漏应用。
// 引擎口径：仅 small / large 映射，其余值（含 "20px"/"normal"）返回 undefined（渲染层丢弃）。

export function displaySizeToCss(size?: string): string | undefined {
  if (size === 'small') return '0.85em'
  if (size === 'large') return '1.3em'
  return undefined
}