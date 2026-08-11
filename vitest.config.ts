import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    pool: 'forks',
    // 注释：vitest 4 迁移（2026-08-11）——poolOptions 已移除（DEPRECATED 警告），选项提升顶层：
    // singleFork（文件串行共享进程）→ fileParallelism: false；execArgv 顶层
    execArgv: ['--max-old-space-size=8192'],
    fileParallelism: false,
    testTimeout: 60000,
    // 注释：talk-common 全量数据（7 万+条目）的 beforeAll 加载需更长时间——默认 10s 会超时
    // 导致加载数据的测试文件整体 skipped（2026-08-08 新地文导入后暴露）
    // 2026-08-11：提到 120s——插件默认层 rawTomlMap 缓存已治本（71.6MB 只解析一次），
    // 提高兜底机器负载尖峰（文件串行 + GC 停顿），防随机误报
    hookTimeout: 120000,
  },
})
