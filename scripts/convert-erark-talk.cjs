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

// ===== CSV 解析（支持引号内逗号）=====
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

// ===== erArk 模板变量 → 我们的 {obj.prop} 插值格式 =====
const VAR_MAP = {
  // 说话者/行动者
  'Name': '{character.name}',
  'NickName': '{character.name}',
  'NickNameToPl': '{character.nickname}',

  // 玩家
  'PlayerName': '{player.name}',
  'PlayerNickName': '{player.nickname}',
  'PlayerTargetName': '{player.targetName}',

  // 交互对象
  'TargetName': '{target.name}',
  'TargetNickName': '{target.name}',
  'TargetNickNameToPl': '{target.nickname}',

  // H 交互相关
  'HInterruptCharaName': '{character.name}',
  'TargetBondageName': '{character.name}',

  // 地点
  'SceneName': '{location.name}',
  'SceneOneCharaName': '{location.randomCharaName}',
  'TargetSceneName': '{targetLocation.name}',
  'TargetOneCharaName': '{targetLocation.randomCharaName}',
  'SrcSceneName': '{sourceLocation.name}',
  'SrcOneCharaName': '{sourceLocation.randomCharaName}',

  // 衣物
  'SelfUpClothName': '{character.wearUpper}',
  'SelfDownClothName': '{character.wearLower}',
  'TargetUpClothName': '{target.wearUpper}',
  'TargetDownClothName': '{target.wearLower}',
  'TargetBraName': '{target.wearBra}',
  'TargetPanName': '{target.wearPanties}',
  'TargetSkiName': '{target.wearSkirt}',
  'TargetSocName': '{target.wearSocks}',
  'UpClothName': '{character.wearUpper}',
  'DownClothName': '{character.wearLower}',
  'PanName': '{character.wearPanties}',
  'SocName': '{character.wearSocks}',

  // 上下文物品
  'FoodName': '{foodName}',
  'AllFoodName': '{allFoodName}',
  'BookName': '{bookName}',
  'BoardGameName': '{boardGameName}',
  'MakeFoodTime': '{makeFoodTime}',
  'MilkMl': '{milkMl}',

  // erark 杂项（极少用，保底映射）
  'Jump': '',
  'n': '',
}

function convertTemplateVars(text) {
  if (!text) return ''
  // 为避免 {TargetName的} 被 {TargetName} 的替换误伤，先处理带后缀的
  let result = text
    .replace(/\{TargetName的\}/g, '{target.name}的')
  // 批量替换已知变量——从长到短排序避免子串误匹配
  const keys = Object.keys(VAR_MAP).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    const val = VAR_MAP[key]
    const pattern = new RegExp('\\{' + key + '\\}', 'g')
    result = result.replace(pattern, val)
  }
  return result
}

// ===== 转义文本为 TOML 安全字符串 =====
function escapeToml(text) {
  // 1. 保护 erark 原生的 \n（在 CSV 里是字面反斜杠+n，表示换行）
  // 2. 转义所有剩余反斜杠
  // 3. 恢复保护的 \n
  // 4. 转义引号
  // 5. 真实换行符 → \n
  return text
    .replace(/\\n/g, '\x00N')
    .replace(/\\/g, '\\\\')
    .replace(/\x00N/g, '\\n')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
}

// ===== 主流程 =====
function main() {
  const talkDir = path.join(process.cwd(), ERA_TALK_DIR)
  if (!fs.existsSync(talkDir)) {
    console.error(`❌ 找不到口上目录: ${talkDir}`)
    process.exit(1)
  }

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

  // 去重（同 scene + condition + text 合并）
  const seen = new Set()
  const unique = allLines.filter(l => {
    const key = `${l.scene}|${l.condition || ''}|${l.text}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  console.log(`去重后: ${unique.length} 条`)

  // 按 scene 分组排序
  unique.sort((a, b) => a.scene.localeCompare(b.scene))

  // 生成 TOML
  let toml = '# 自动生成—请勿手动编辑\n'
  toml += `# 来源: erArk data/talk/ (${csvFiles.length} files)\n`
  toml += `# 口上数: ${unique.length}\n\n`

  for (const line of unique) {
    toml += `[[scene_lines]]\n`
    toml += `scene = "${line.scene}"\n`
    if (line.condition) toml += `condition = "${line.condition}"\n`
    toml += `text = "${escapeToml(line.text)}"\n\n`
  }

  const outPath = path.join(process.cwd(), OUT_FILE)
  fs.writeFileSync(outPath, toml, 'utf-8')
  console.log(`\n✅ 已写入 ${outPath}: ${unique.length} 条口上`)
}

main()
