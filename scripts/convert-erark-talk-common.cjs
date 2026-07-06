/**
 * erArk talk_common CSV → TOML 批量转换脚本
 *
 * 用法: node scripts/convert-erark-talk-common.cjs
 *
 * 分类规则：
 *   body/xxx.csv               → variable = xxx（单段，直接输出）
 *   body_part/xxx_s_A+B.csv    → variable = xxx_s（多段 A+B，合并进一个文件）
 *   body_part/common_s_A.csv   → variable = common_s（共享形容词池）
 *   action_X/penis_in_body/    → variable = action_X_penis_in_YYY（单段，用文件路径）
 *   action_X/orgasm/           → variable = action_X_v_orgasm_small（单段，用文件路径）
 */

const fs = require('fs')
const path = require('path')

const ERA_DIR = '用来复刻的蓝本游戏 erArk 不要commit/data/talk_common'
const OUT_DIR = 'src/plugins/talk-common-system/data/default/talk-common'

// ===== CSV 解析 =====
function parseCSV(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8')
  // 去除 BOM
  const text = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw
  const lines = text.split(/\r?\n/)

  // 跳过前5行头部
  const dataLines = lines.filter((l, i) => {
    if (i < 5) return false
    return l.trim().length > 0
  })

  const entries = []
  for (const line of dataLines) {
    const fields = []
    let current = ''
    let inQuotes = false
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue }
      current += ch
    }
    fields.push(current.trim())
    if (fields.length >= 5) {
      const cid = fields[0]
      const typeId = fields[1]
      const premise = fields[3]
      const context = fields[4]
      if (cid && context && !isNaN(parseInt(cid))) {
        entries.push({ cid: parseInt(cid), typeId, premise, context })
      }
    }
  }
  return entries
}

// ===== TOML 安全转义 =====
function escapeToml(text) {
  return text
    .replace(/\\n/g, '\x00N')
    .replace(/\\/g, '\\\\')
    .replace(/\x00N/g, '\\n')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
}

// ===== body 部位中文名（仅用于 description 字段）=====
const BODY_CN = {
  vagina: '阴道', penis: '阴茎', anal: '肛门', breast: '乳房',
  mouth: '口', face: '脸', feet: '脚', hands: '手',
  legs: '腿', hair: '头发', armpit: '腋下', throat: '喉咙',
  urethra: '尿道', womb: '子宫',
}

// ===== 从文件路径推导变量名和输出子目录 =====
// 返回 { variable, outSubDir, parts, isBodyPart }
function deriveVariable(filePath, entries) {
  const relPath = path.relative(ERA_DIR, filePath).replace(/\\/g, '/')
  const segs = relPath.split('/')
  const topDir = segs[0]    // body / body_part / action_A / ...
  const fileName = segs[segs.length - 1].replace(/\.csv$/, '')  // e.g., "vagina" or "vagina_s_A"

  // ── body/ ──
  if (topDir === 'body') {
    return {
      variable: fileName,
      outSubDir: 'body',
      parts: [],
      isBodyPart: false,
    }
  }

  // ── body_part/ ──
  if (topDir === 'body_part') {
    // 提取基础变量名：common_s_A → common_s,  vagina_s_A → vagina_s
    const baseVar = fileName.replace(/_(A|B)$/, '')
    const suffix = fileName.slice(-1)  // A 或 B
    return {
      variable: baseVar,
      outSubDir: 'body_part',
      parts: [suffix],
      isBodyPart: true,
      partFromFile: suffix,  // 需要在文件级别合并 A+B
    }
  }

  // ── action_X/ ──
  if (/^action_[A-Z][12]?$/.test(topDir)) {
    const actionLevel = topDir  // e.g., "action_A"
    const actionType = segs[1]  // "penis_in_body" 或 "orgasm"

    if (actionType === 'penis_in_body') {
      // filename = "penis_in_vagina_A" → body part = "vagina", level = "A"
      // 但我们不用 level 来命名，只用 body part
      const match = fileName.match(/^penis_in_(\w+)_[A-Z][12]?$/)
      if (match) {
        const bodyPart = match[1]
        return {
          variable: `${actionLevel}_penis_in_${bodyPart}`,
          outSubDir: actionLevel,
          parts: [],
          isBodyPart: false,
        }
      }
    }

    if (actionType === 'orgasm') {
      // filename = "v_orgasm_small_A" → 去掉最后 level 字母
      const base = fileName.replace(/_[A-Z][12]?$/, '')
      return {
        variable: `${actionLevel}_${base}`,
        outSubDir: actionLevel,
        parts: [],
        isBodyPart: false,
      }
    }

    // fallback: 用文件名
    return {
      variable: `${actionLevel}_${fileName}`,
      outSubDir: actionLevel,
      parts: [],
      isBodyPart: false,
    }
  }

  // fallback
  return {
    variable: fileName,
    outSubDir: topDir,
    parts: [],
    isBodyPart: false,
  }
}

// ===== erArk 变量 → {obj.prop} 格式 =====
// 与 convert-erark-talk.cjs 的 VAR_MAP 保持一致
const VAR_MAP = [
  // 说话者
  ['{Name}', '{character.name}'],
  ['{NickName}', '{character.name}'],
  ['{NickNameToPl}', '{character.nickname}'],
  // 玩家
  ['{PlayerName}', '{player.name}'],
  ['{PlayerNickName}', '{player.nickname}'],
  ['{PlayerTargetName}', '{player.targetName}'],
  // 交互对象
  ['{TargetName}', '{target.name}'],
  ['{TargetNickName}', '{target.name}'],
  ['{TargetNickNameToPl}', '{target.nickname}'],
  ['{TargetName的}', '{target.name}的'],
  // H 相关
  ['{HInterruptCharaName}', '{character.name}'],
  ['{TargetBondageName}', '{character.name}'],
  // 地点
  ['{SceneName}', '{location.name}'],
  ['{SceneOneCharaName}', '{location.randomCharaName}'],
  ['{TargetSceneName}', '{targetLocation.name}'],
  ['{TargetOneCharaName}', '{targetLocation.randomCharaName}'],
  ['{SrcSceneName}', '{sourceLocation.name}'],
  ['{SrcOneCharaName}', '{sourceLocation.randomCharaName}'],
  // 衣物
  ['{SelfUpClothName}', '{character.wearUpper}'],
  ['{SelfDownClothName}', '{character.wearLower}'],
  ['{TargetUpClothName}', '{target.wearUpper}'],
  ['{TargetDownClothName}', '{target.wearLower}'],
  ['{TargetBraName}', '{target.wearBra}'],
  ['{TargetPanName}', '{target.wearPanties}'],
  ['{TargetSkiName}', '{target.wearSkirt}'],
  ['{TargetSocName}', '{target.wearSocks}'],
  ['{UpClothName}', '{character.wearUpper}'],
  ['{DownClothName}', '{character.wearLower}'],
  ['{PanName}', '{character.wearPanties}'],
  ['{SocName}', '{character.wearSocks}'],
  // 物品
  ['{FoodName}', '{foodName}'],
  ['{AllFoodName}', '{allFoodName}'],
  ['{BookName}', '{bookName}'],
  ['{BoardGameName}', '{boardGameName}'],
  ['{MakeFoodTime}', '{makeFoodTime}'],
  ['{MilkMl}', '{milkMl}'],
  // 杂项
  ['{Jump}', ''],
  ['{n}', ''],
]

function convertContextVars(text) {
  let result = text
  // 先处理带后缀的避免子串误伤（注意大括号已在正则中处理）
  result = result.replace(/\{TargetName的\}/g, '{target.name}的')
  for (const [from, to] of VAR_MAP) {
    // 跳过已处理的
    if (from === '{TargetName的}') continue
    const pattern = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
    result = result.replace(pattern, to)
  }
  return result
}

// ===== 主流程 =====
function main() {
  const eraDir = path.resolve(ERA_DIR)
  if (!fs.existsSync(eraDir)) {
    console.error(`❌ 找不到: ${eraDir}`)
    process.exit(1)
  }

  // 第一阶段：按文件收集条目（body_part 需要跨文件合并）
  //    variable -> { fileKey -> { parts: Set, entries: [] } }
  //    body_part 的 A/B 文件合并到同一个 variable
  const fileGroups = {}  // variable -> { entries: [], parts: Set, subDir: '', sourceFiles: [] }

  function scanDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) { scanDir(fullPath); continue }
      if (!entry.name.endsWith('.csv')) continue

      const entries = parseCSV(fullPath)
      if (entries.length === 0) continue

      const info = deriveVariable(fullPath, entries)
      if (!info.variable || info.variable === '0') continue

      if (!fileGroups[info.variable]) {
        fileGroups[info.variable] = {
          entries: [],
          parts: new Set(),
          subDir: info.outSubDir,
          sourceFiles: [],
        }
      }

      const g = fileGroups[info.variable]
      g.sourceFiles.push(entry.name)

      // body_part 类型的 A/B 文件：记录 part 信息
      if (info.isBodyPart) {
        for (const e of entries) {
          const partLetter = info.partFromFile || e.typeId.slice(-1)
          g.parts.add(partLetter)
          g.entries.push({
            context: convertContextVars(e.context),
            premise: e.premise,
            part: partLetter,
          })
        }
      } else {
        for (const e of entries) {
          const parsedPart = info.parts.length > 0 ? info.parts[0] : null
          g.entries.push({
            context: convertContextVars(e.context),
            premise: e.premise,
            part: parsedPart || undefined,
          })
        }
      }
    }
  }

  scanDir(eraDir)

  // 第二阶段：输出 TOML
  const varNames = Object.keys(fileGroups).sort()
  const totalEntries = varNames.reduce((s, v) => s + fileGroups[v].entries.length, 0)
  console.log(`解析出 ${varNames.length} 个变量，${totalEntries} 条目\n`)

  // 创建输出目录
  const outDirs = new Set([...Object.values(fileGroups)].map(g => path.join(OUT_DIR, g.subDir)))
  for (const d of outDirs) fs.mkdirSync(d, { recursive: true })

  // 写 TOML
  for (const variable of varNames) {
    const g = fileGroups[variable]
    const subDir = g.subDir

    // 去重
    const seen = new Set()
    const unique = g.entries.filter(e => {
      const key = `${e.part || ''}|${e.context}|${e.premise}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // 确定 parts（body_part 类型）
    const partsArr = [...g.parts].sort()
    const isMultiPart = subDir === 'body_part'

    // 生成 description
    let desc
    if (subDir === 'body') {
      const cn = BODY_CN[variable] || variable
      desc = `${cn}——完整的描述文本`
    } else if (subDir === 'body_part') {
      const baseName = variable.replace(/_s$/, '')
      const cn = BODY_CN[baseName] || baseName
      desc = `${cn}短词——${partsArr.map(p => `part ${p}`).join('+')}拼接`
    } else if (subDir.startsWith('action_')) {
      const readable = variable.replace(/_/g, ' ')
      desc = `动作·${readable}——体位条件描述文本`
    } else {
      desc = variable
    }

    // 构建 TOML 内容
    let toml = '# 自动生成—请勿手动编辑\n'
    toml += `# 来源: erArk data/talk_common/ (${g.sourceFiles.join(', ')})\n`
    toml += `# 条目数: ${unique.length}\n`
    toml += `\n`
    toml += `variable = "${variable}"\n`
    toml += `description = "${desc}"\n`
    if (isMultiPart && partsArr.length > 0) {
      toml += `parts = [${partsArr.map(p => `"${p}"`).join(', ')}]\n`
    }

    for (const e of unique) {
      toml += `\n[[entries]]\n`
      if (isMultiPart && e.part) {
        toml += `part = "${e.part}"\n`
      }
      if (e.premise && e.premise !== '0') {
        toml += `conditions = "premises:${e.premise}"\n`
      }
      toml += `context = "${escapeToml(e.context)}"\n`
    }

    const outFileName = `${variable}.toml`
    const outPath = path.join(OUT_DIR, subDir, outFileName)
    fs.writeFileSync(outPath, toml, 'utf-8')

    const partInfo = isMultiPart ? ` parts=${JSON.stringify(partsArr)}` : ''
    console.log(`  ${subDir}/${outFileName}  (${unique.length} 条${partInfo})`)
  }

  console.log(`\n✅ 已写入 ${varNames.length} 个 TOML 文件`)
}

main()
