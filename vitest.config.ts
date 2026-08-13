import { defineConfig } from 'vitest/config'
import { rawTextPlugin } from './config/raw-text-plugin.ts'

export default defineConfig({
  plugins: [rawTextPlugin()],
  test: {
    pool: 'forks',
    // 注释：vitest 4 迁移（2026-08-11）：poolOptions 已移除（DEPRECATED 警告）——可选新配置项：
    // singleFork（文件级共进程）、fileParallelism: false、execArgv 等
    execArgv: ['--max-old-space-size=8192'],
    fileParallelism: false,
    testTimeout: 60000,
    // 注释：talk-common 全量数据（7 万+条目）的 beforeAll 校验很耗时——默认 10s 会超时，
    // 导致大量数据相关的测试文件被 skipped（2026-08-08 新引入的文档描述行为）
    // 2026-08-11：提到 120s（兼容默认 rawTomlMap 两次加载——首次加载后 71.6MB 只解析一次，
    // 后续为惰性缓存命中，非重复解析；主要耗时是文件过多 + GC 停顿）
    hookTimeout: 120000,
  },
})
