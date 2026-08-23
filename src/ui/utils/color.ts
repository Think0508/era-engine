// 引擎色值 → CSS 色值（ADR 0018 配套修复）
// 引擎口上约定 8 位十六进制为 #AARRGGBB（如 #80FF0000 = 50% 透明红）；
// CSS 的 8 位 hex 是 #RRGGBBAA——直接透传会把 alpha 塞到错误的位置
// （#80FF0000 被浏览器读成全透明）。渲染层一律经本函数转换。

export function toCssColor(value: string): string {
  const v = value.trim()
  const m = /^#([0-9a-fA-F]{8})$/.exec(v)
  if (m) {
    const a = parseInt(m[1].slice(0, 2), 16) / 255
    const r = parseInt(m[1].slice(2, 4), 16)
    const g = parseInt(m[1].slice(4, 6), 16)
    const b = parseInt(m[1].slice(6, 8), 16)
    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`
  }
  return v
}