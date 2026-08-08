import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        execArgv: ['--max-old-space-size=8192'],
      },
    },
    testTimeout: 60000,
    // 注释：talk-common 全量数据（7 万+条目）的 beforeAll 加载需更长时间——默认 10s 会超时
    // 导致加载数据的测试文件整体 skipped（2026-08-08 新地文导入后暴露）
    hookTimeout: 60000,
  },
})
