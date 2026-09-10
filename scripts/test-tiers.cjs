#!/usr/bin/env node
/**
 * test-tiers.cjs —— 测试分层运行器（2026-09-11）
 *
 * 背景：全套 131 文件 / 1577 用例约 506s，但**测试逻辑本身只有 ~46s**。
 * 其余时间花在"重集成文件各自 beforeAll 冷启动一次引擎+口上数据"
 * （单个 talk-common 重集成文件 ≈ 8.5-19.5s，其中断言只有几十 ms）。
 *
 * 分层判据（内容匹配，非路径）：
 *   集成层（integration）：文件内出现 `loadMod(` / `parseModData(` / `talkCommonOnEnable`
 *                          —— 需要真实引擎+mod 数据装载的用例
 *   单元层（unit）       ：其余（core 机制、纯函数、插件隔离用例）
 *
 * 用法：
 *   node scripts/test-tiers.cjs unit          # 快速环（实测 ~18s / 456 用例）
 *   node scripts/test-tiers.cjs integration   # 重集成层
 *   node scripts/test-tiers.cjs list          # 只打印分层清单与数量
 *   node scripts/test-tiers.cjs unit --watch  # 额外参数透传给 vitest
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const SCAN_DIRS = ['src', 'tools']
const HEAVY_RE = /loadMod\(|parseModData\(|talkCommonOnEnable/

/** 递归收集 *.test.ts（跳过 node_modules / dist） */
function collectTestFiles(dir, out = []) {
  const abs = path.join(ROOT, dir)
  if (!fs.existsSync(abs)) return out
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue
    const rel = path.posix.join(dir, entry.name)
    if (entry.isDirectory()) collectTestFiles(rel, out)
    else if (entry.name.endsWith('.test.ts')) out.push(rel)
  }
  return out
}

function classify() {
  const files = SCAN_DIRS.flatMap(d => collectTestFiles(d)).sort()
  const unit = []
  const integration = []
  for (const rel of files) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    ;(HEAVY_RE.test(src) ? integration : unit).push(rel)
  }
  return { unit, integration }
}

const [, , tier = 'unit', ...passthrough] = process.argv
const { unit, integration } = classify()

if (tier === 'list') {
  console.log(`[test-tiers] unit=${unit.length} integration=${integration.length} total=${unit.length + integration.length}`)
  console.log('\n# unit')
  for (const f of unit) console.log('  ' + f)
  console.log('\n# integration')
  for (const f of integration) console.log('  ' + f)
  process.exit(0)
}

const files = tier === 'unit' ? unit : tier === 'integration' ? integration : null
if (!files) {
  console.error(`[test-tiers] 未知分层 '${tier}'（可用：unit | integration | list）`)
  process.exit(2)
}

console.log(`[test-tiers] ${tier}：${files.length} 个文件（共 ${unit.length + integration.length}）`)
// 直接跑本地 vitest CLI（不经 npx/.cmd——Windows 下 spawnSync 对 .cmd 会 EINVAL）
const vitestCli = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs')
execFileSync(process.execPath, [vitestCli, 'run', ...passthrough, ...files], {
  cwd: ROOT,
  stdio: 'inherit',
})
