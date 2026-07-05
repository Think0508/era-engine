/**
 * erArk 口上 CSV → scene-dialogue.toml 转换脚本
 * 读取 data/talk/ 下所有 CSV → 生成 scene-dialogue.toml
 *
 * 用法: node scripts/convert-erark-talk.cjs
 */

const fs = require('fs')
const path = require('path')

const ERA_TALK_DIR = '用来复刻的蓝本游戏 erArk 不要commit/data/talk'
const OUT_FILE = 'mods/test-mod/definitions/scene-dialogue.toml'

// ===== CSV 解析（简单版，支持引号内逗号）=====
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  const result = []
  for (const line of lines) {
    if (line.startsWith('cid,') || line.startsWith('口上') || line.match(/^(str|int)/)) continue
    const fields = []
    let current = ''
    let inQuotes = false
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue }
      current += ch
    }
    fields.push(current.trim())
    if (fields.length >= 5 && fields[1]) result.push(fields)
  }
  return result
}

// ===== erArk 模板变量 → 我们的插值格式 =====
function convertTemplateVars(text) {
  if (!text) return ''
  return text
    .replace(/\{Name\}/g, '{player.name}')
    .replace(/\{TargetName\}/g, '{character.name}')
    .replace(/\{HInterruptCharaName\}/g, '{character.name}')
    .replace(/\{TargetBondageName\}/g, '{character.name}')
    // 剩余无法翻译的变量保留原样（不崩）
}

// ===== 主流程 =====
function main() {
  const talkDir = path.join(process.cwd(), ERA_TALK_DIR)
  if (!fs.existsSync(talkDir)) {
    console.error(`❌ 找不到口上目录: ${talkDir}`)
    process.exit(1)
  }

  // 注释：递归扫描所有 CSV
  const csvFiles = []
  function scanDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) scanDir(fullPath)
      else if (entry.name.endsWith('.csv')) csvFiles.push(fullPath)
    }
  }
  scanDir(talkDir)
  console.log(`找到 ${csvFiles.length} 个口上 CSV 文件`)

  const allLines = []
  let skippedNoBehavior = 0
  let skippedNoContext = 0

  for (const filePath of csvFiles) {
    const text = fs.readFileSync(filePath, 'utf-8')
    const rows = parseCSV(text)
    if (rows.length === 0) continue

    for (const row of rows) {
      const behaviorId = (row[1] || '').trim()
      const premise = (row[3] || '').trim()
      const context = (row[4] || '').trim()

      if (!behaviorId || behaviorId === '0') { skippedNoBehavior++; continue }
      if (!context) { skippedNoContext++; continue }

      const line = { scene: behaviorId, text: convertTemplateVars(context) }
      if (premise && premise !== '0') {
        line.condition = `premises:${premise}`
      }
      allLines.push(line)
    }
  }

  console.log(`解析出 ${allLines.length} 条口上`)
  console.log(`跳过: 无behavior=${skippedNoBehavior}, 无文本=${skippedNoContext}`)

  // 注释：去重（同 scene + condition + text 的合并）
  const seen = new Set()
  const unique = allLines.filter(l => {
    const key = `${l.scene}|${l.condition || ''}|${l.text}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  console.log(`去重后: ${unique.length} 条`)

  // 注释：按 scene 分组排序
  unique.sort((a, b) => a.scene.localeCompare(b.scene))

  // 注释：生成 TOML
  let toml = '# 自动生成—请勿手动编辑\n'
  toml += `# 来源: erArk data/talk/ (${csvFiles.length} files)\n`
  toml += `# 口上数: ${unique.length}\n\n`

  for (const line of unique) {
    toml += `[[scene_lines]]\n`
    toml += `scene = "${line.scene}"\n`
    if (line.condition) toml += `condition = "${line.condition}"\n`
    // 注释：避免 TOML 特殊字符导致解析失败
    const safeText = line.text.replace(/"/g, '\\"').replace(/\n/g, '\\n')
    toml += `text = "${safeText}"\n\n`
  }

  const outPath = path.join(process.cwd(), OUT_FILE)
  fs.writeFileSync(outPath, toml, 'utf-8')
  console.log(`\n✅ 已写入 ${outPath}: ${unique.length} 条口上`)
}

main()
