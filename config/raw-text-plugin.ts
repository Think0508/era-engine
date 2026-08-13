import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'

// 注释：原始文本模块插件（2026-08-13 构建审计修复）——
// rolldown 1.x 的 import.meta.glob + query:'?raw' 在 build 阶段不生效（TOML 内容被当 JS 解析报错，
// dev/vitest 走 transform 管线正常）。本插件把 .toml/.json 转成 default 导出字符串的 JS 模块，
// glob 调用点去掉 query 即可（import:'default' 拿到字符串，语义与 ?raw 一致）。
// vite.config.ts 与 vitest.config.ts 共用。
export function rawTextPlugin(): Plugin {
  return {
    name: 'era-engine:raw-text',
    enforce: 'pre',
    load(id) {
      if (id.endsWith('.toml') || id.endsWith('.json')) {
        const content = readFileSync(id.replace(/\?.*$/, ''), 'utf8')
        return `export default ${JSON.stringify(content)}`
      }
      return null
    },
  }
}
