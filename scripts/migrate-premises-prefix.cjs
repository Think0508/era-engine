// 一次性迁移：conditions = "premises:A&B&expr..." → "premise(A) && premise(B) && (expr...)"
// 权重值比较段（premises:FOO==N，erArk 前提权重值比较）→ "premise(FOO) == N"（表达式引擎原生支持）
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
  if (!cond.includes('premises:')) return cond
  // 1. 保护 &&（占位符避免被单 & 切分误切）
  const andPlaceholders = []
  const protectedStr = cond.replace(/&&/g, () => {
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
  // 3. 还原 && 并重组
  const joined = converted.join(' && ')
  return joined.replace(/\u0001A(\d+)\u0001/g, (_m, i) => andPlaceholders[Number(i)])
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
      const hits = (raw.match(/premises:/g) || []).length
      if (hits > 0) { total += hits; console.log(`${hits}\t${file}`) }
    } else {
      total += processFile(file)
    }
  }
}
console.log(`total: ${total}${write ? ' (written)' : ' (dry run — rerun with --write)'}`)
