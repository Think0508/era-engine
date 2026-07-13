const fs = require('fs')
const csv = fs.readFileSync('用来复刻的蓝本游戏 erArk 不要commit/data/csv/Talent.csv', 'utf-8')
const lines = csv.split(/\r?\n/).filter(l => l.trim())
const data = lines.slice(5).filter(l => /^\d+,/.test(l))

const typeMap = { 0: '性素质', 1: '身体素质', 2: '精神素质', 3: '技术素质', 4: '其他素质' }

// 排除世界观绑定的 ID
const exclude = new Set([
  150, 162, 168, 171,
  304, 305, 306,
])

let output = '# 插件默认天赋（由 erArk Talent.csv 自动转换）\n'
output += '# 排除：源石病相关/博士信息素/透视等 Arknights 世界观专属\n\n'

for (const line of data) {
  const p = line.split(',')
  const id = parseInt(p[0])
  const type = parseInt(p[1])
  const name = p[2]
  if (exclude.has(id) || !name) continue

  output += `[talents."${name}"]\n`
  output += `name = "${name}"\n`
  output += `max = 1\n`
  output += `description = ""\n`
  output += `tags = ["${typeMap[type] || 'other'}"]\n\n`
}

fs.writeFileSync('src/plugins/h-core/data/default/talents.toml', output, 'utf-8')
console.log('✅ 已生成 src/plugins/h-core/data/default/talents.toml')
