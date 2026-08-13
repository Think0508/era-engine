// 一次性迁移：conditions 字符串中的单 & 分隔 → ' && ' 连接；premises:X 段 → premise(X)
// 覆盖两类：① 含 premises: 前缀的段；② 纯表达式段之间的单 & 分隔（旧引擎恒 true 的静默错误源）
// 幂等：已转换的行（&& 连接）再跑不变
// 用法：node scripts/migrate-premises-prefix.cjs [--write]
const fs = require('fs')
const path = require('path')

const TARGET_DIRS = [
  'src/plugins/talk-common-system/data/default',
  'mods',
]

// FOO==N / FOO>=N / FOO<=N / FOO>N / FOO<N（前提权重值比较段）
const WEIGHT_CMP_RE = /^([A-Za-z_][\w]*)\s*(==|>=|<=|>|<)\s*(-?\d+)$/

function convertCondition(cond) {
  // 0. 保护字符串字面量（引号内的 & 不是分隔符）
  const strPlaceholders = []
  const noStrings = cond.replace(/"[^"]*"|'[^']*'/g, (m) => {
    const idx = strPlaceholders.length
    strPlaceholders.push(m)
    return `\u0002S${idx}\u0002`
  })
  if (!noStrings.includes('&')) return cond
  // 1. 保护 &&（占位符避免被单 & 切分误切）
  const andPlaceholders = []
  const protectedStr = noStrings.replace(/&&/g, () => {
    const idx = andPlaceholders.length
    andPlaceholders.push('&&')
    return `\u0001A${idx}\u0001`
  })
  // 2. 按单 & 切分（保护后剩下的 & 都是单字符分隔）
  const parts = protectedStr.split('&').map(s => s.trim()).filter(Boolean)
  const converted = parts.map(part => {
    if (part.startsWith('premises:')) {
      const inner = part.slice('premises:'.length).trim()
      const cmp = inner.match(WEIGHT_CMP_RE)
      if (cmp) return `premise(${cmp[1]}) ${cmp[2]} ${cmp[3]}`
      return `premise(${inner})`
    }
    return part
  })
  // 3. 还原 && 与字符串字面量并重组
  let joined = converted.join(' && ')
  joined = joined.replace(/\u0001A(\d+)\u0001/g, (_m, i) => andPlaceholders[Number(i)])
  joined = joined.replace(/\u0002S(\d+)\u0002/g, (_m, i) => strPlaceholders[Number(i)])
  return joined
}

function processFile(file) {
  const raw = fs.readFileSync(file, 'utf8')
  let changed = 0
  const lines = raw.split('\n')
  const out = lines.map(line => {
    const m = line.match(/^(\s*conditions\s*=\s*")(.*)("\s*)$/)
    if (!m) return line
    if (m[2].includes('\\"')) return line
    const converted = convertCondition(m[2])
    if (converted === m[2]) return line
    changed++
    return `${m[1]}${converted}${m[3]}`
  })
  if (changed > 0) {
    fs.writeFileSync(file, out.join('\n'), 'utf8')
  }
  return changed
}

function scan(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) scan(full, acc)
    else if (entry.name.endsWith('.toml')) acc.push(full)
  }
  return acc
}

const write = process.argv.includes('--write')
let total = 0
for (const dir of TARGET_DIRS) {
  if (!fs.existsSync(dir)) continue
  for (const file of scan(dir, [])) {
    if (!write) {
      const raw = fs.readFileSync(file, 'utf8')
      const lines = raw.split('\n')
      let hits = 0
      for (const line of lines) {
        const m = line.match(/^(\s*conditions\s*=\s*")(.*)("\s*)$/)
        if (!m) continue
        if (convertCondition(m[2]) !== m[2]) hits++
      }
      if (hits > 0) { total += hits; console.log(`${hits}\t${file}`) }
    } else {
      total += processFile(file)
    }
  }
}
console.log(`total: ${total}${write ? ' (written)' : ' (dry run — rerun with --write)'}`)
