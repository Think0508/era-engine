#!/usr/bin/env node
/**
 * 第1层扫描：TS 代码中文属性引用 vs attributes.toml 定义权威（标准角色契约 spec §10.1 Step 2）
 *
 * 双向校验：attributes.toml 是定义权威，代码引用未定义属性 = 契约违规（改代码或补定义，禁止静默）
 *
 * 扫描三类引用（其余中文字面量归 UNMATCHED，人工三审，多为 UI/日志/数据值文本）：
 *   1. 属性访问上下文：getEntityAttr/setEntityAttr/getEntityPath/setEntityPath 实参、
 *      bindings.get/bindings.set 实参、['中文'] 属性索引、.中文 点访问、
 *      效果参数 attr:/state:/expId:（同行）
 *   2. 条件表达式（evaluateCondition / validateExpression / 含路径根的字面量）：
 *      提取点路径 token 逐段核对，跳过实体 ID 位置段（character.{id}. relations.{id}.
 *      quest.{id}. inventory.{itemId}.）与引号字符串值
 *   3. ATTR.XXX 常量展开（entity-utils.ts 的 ATTR 对象 → 取值 → 比对）
 *
 * 定义集合（已知可用名）：
 *   attributes.toml（插件默认 + mod 合并）/ abilities.toml / talents.toml /
 *   status-effects.toml / relations.toml types + 结构白名单
 *
 * 用法: node scripts/scan-attr-refs.cjs [--report=docs/instruction-replication/attr-scan-report.md]
 * 退出码: 1 = 有 VIOLATION（CI 可接）
 */
const fs = require('fs')
const path = require('path')
const TOML = require('@iarna/toml')

const ROOT = path.resolve(__dirname, '..')
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/')

// ========== 定义集合 ==========
function loadTomlKeys(relPaths, sectionKey) {
  const keys = new Set()
  for (const rel of relPaths) {
    const abs = path.join(ROOT, rel)
    if (!fs.existsSync(abs)) continue
    try {
      const data = TOML.parse(fs.readFileSync(abs, 'utf8'))
      const section = data[sectionKey]
      if (section && typeof section === 'object') {
        for (const k of Object.keys(section)) keys.add(k)
      }
    } catch (e) {
      console.error(`[scan-attr-refs] TOML 解析失败: ${rel} — ${e.message}`)
    }
  }
  return keys
}

function collectFiles(dir, ext) {
  const out = []
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'archive') continue
        walk(full)
      } else if (entry.name.endsWith(ext)) {
        out.push(full)
      }
    }
  }
  walk(dir)
  return out
}

const pluginDefs = (name) => collectFiles(path.join(ROOT, 'src', 'plugins'), name).filter(p => p.includes('data' + path.sep + 'default')).map(rel)
const modDefs = (name) => collectFiles(path.join(ROOT, 'mods'), name).map(rel)
const attrDefs = loadTomlKeys([...pluginDefs('attributes.toml'), ...modDefs('attributes.toml')], 'attributes')
const abilityDefs = loadTomlKeys([...pluginDefs('abilities.toml'), ...modDefs('abilities.toml')], 'abilities')
const talentDefs = loadTomlKeys(pluginDefs('talents.toml'), 'talents')
const statusDefs = loadTomlKeys(pluginDefs('status-effects.toml'), 'status-effects')
const relationDefs = loadTomlKeys(pluginDefs('relations.toml'), 'types')
// 注释：规则/成就 id（gain-rule-system，2026-08-16）——[[rules]]/[[achievements]] 数组条目的
// id 字段（mod 自定义标识，非属性名；代码里 mod.gainRules['中文'] 等索引引用不查 attributes 定义集）
const ruleIdDefs = loadArrayItemField([...pluginDefs('gain-rules.toml'), ...modDefs('gain-rules.toml')], 'rules', 'id')
const achIdDefs = loadArrayItemField([...pluginDefs('achievements.toml'), ...modDefs('achievements.toml')], 'achievements', 'id')

function loadArrayItemField(relPaths, sectionKey, field) {
  const keys = new Set()
  for (const rel of relPaths) {
    const abs = path.join(ROOT, rel)
    if (!fs.existsSync(abs)) continue
    try {
      const data = TOML.parse(fs.readFileSync(abs, 'utf8'))
      const list = data[sectionKey]
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item && typeof item === 'object' && typeof item[field] === 'string') keys.add(item[field])
        }
      }
    } catch (e) {
      console.error(`[scan-attr-refs] TOML 解析失败: ${rel} — ${e.message}`)
    }
  }
  return keys
}

const defined = new Set([...attrDefs, ...abilityDefs, ...talentDefs, ...statusDefs, ...relationDefs, ...ruleIdDefs, ...achIdDefs])

// ========== 结构字段白名单（已人工确认的非属性中文实体键 / 测试专用）==========
const STRUCTURAL_WHITELIST = new Set([
  // h-hypnosis roleplay 数据（Roleplay.csv 静态表，非实体字段）
  '妻子', '姐姐', '妹妹', '女儿', '妈妈', '小学生', '初中生', '高中生', '大学生', '教师',
  '护士', '警察', '白领', '偶像', '家庭女仆', '咖啡厅女仆', '巫女', '陌生人', '同事', '邻居',
  '家庭', '职业', '关系', '场景', '校园', '非家庭', '无', 'VTuber直播中', '女仆惩罚调教',
  // condition-registry 负向测试用的"必然未定义"名（验证 unknown 检测，非真实引用）
  '不存在的属性',
  // settle-fidelity 负向测试：断言兽部状态/部位不写入（tech_adjust/settle_state 兽部全砍 warning 验证）
  '兽部',
  // character-contract.test.ts 的 TOML fixture 引用（test-mod 已定义的真实天赋名——
  // `[talents."剑骨"]` 表头被属性索引启发式误判，实际是模组数据定义）
  '剑骨',
  // growth.test.fixture.ts 的测试夹具能力（growth-test 假 mod 专用，非 test-mod 定义）
  '吐纳', '玄功',
])

// 结构命名空间（实体上的非属性承载容器）——`ns['中文']` 索引不是属性引用：
// 键的权威校验在各自系统（talents 加载报错 / relations warning / inventory 物品定义…），
// 不查 attributes.toml 定义集。属性承载命名空间（base/params/social/economy/combat/
// abilities/flags）继续查 defined。2026-08-09：example-mod 集成测试暴露该误判。
const STRUCTURAL_NS = new Set([
  'talents', 'relations', 'inventory', 'home_locations', 'equipment',
  'equipment_off', 'equipment_visible', 'equipment_blood', 'assets', 'behavior',
  'experience', 'status_effects', 'marks', 'first_times', 'first_records',
  'pregnancy', 'dirty', 'body_items', 'h_state', 'sp_flag', 'achievement',
  'action_info', 'hypnosis', 'cloth', 'dialogue', 'conversations', 'quests',
  'scenes', 'styles', 'sets', 'schedules',
  // mod 数据访问（关系系统 v2，2026-08-10）——mod.xxx['中文'] 是定义数据不是属性
  'relationGroups', 'relationTypes', 'relationPairs',
  // mod 数据访问（2026-08-12 hunger 测试注入）——modItems['中文'] 是物品定义注入，非属性引用
  'modItems',
  // mod 数据访问（2026-08-15 全量套件修复）——mod.items['中文'] 是物品定义查询，非属性引用
  'items',
  // mod 数据访问（2026-08-16 gain-rule-system）——mod.gainRules['中文'] /
  // mod.achievements['中文'] 是规则/成就 id 查询（id 是 mod 自定义标识，非属性名）
  'gainRules', 'achievements',
])

// 形如 ns['a'] / ns['a']['b'] 的索引链（最后一段可未闭合）→ 返回链首命名空间
function indexChainRoot(before) {
  const m = before.slice(-160).match(/([\w$]+)(?:\[(?:'[^']*'|"[^"]*"|\w*)\]?)+\s*$/)
  return m ? m[1] : null
}

// ========== 工具 ==========
function lineOf(src, at) {
  let line = 1
  for (let i = 0; i < at && i < src.length; i++) if (src[i] === '\n') line++
  return line
}

// 粗略注释检测：// 到行尾（引号配对检查）/ /* */ 块
function inComment(src, at) {
  const before = src.slice(0, at)
  const lineStart = before.lastIndexOf('\n') + 1
  const linePart = before.slice(lineStart)
  const doubleSlash = linePart.lastIndexOf('//')
  if (doubleSlash >= 0) {
    const quoteCount = (linePart.slice(0, doubleSlash).match(/['"`]/g) || []).length
    if (quoteCount % 2 === 0) return true
  }
  const blockStart = before.lastIndexOf('/*')
  const blockEnd = before.lastIndexOf('*/')
  return blockStart > blockEnd
}

const CALL_BEFORE_PATTERNS = [
  /getEntityAttr\s*\(\s*$/, /setEntityAttr\s*\(\s*$/,
  /getEntityPath\s*\(\s*$/, /setEntityPath\s*\(\s*$/,
  /bindings\.(get|set)\s*\(\s*$/, /bindings\.(get|set)\s*\([^)]*,\s*$/,
]
function isCallArg(before) { return CALL_BEFORE_PATTERNS.some(p => p.test(before.slice(-40))) }

function isIndexAccess(before) {
  // 属性索引 ['中文']：要求 [ 前是标识符/括号/引号（排除数组字面量 ['a', 'b']）
  return /[\w)\]'"`]\s*\[\s*$/.test(before.slice(-16)) || /[\w)\]'"`]\s*\.\s*$/.test(before.slice(-6))
}

// 效果参数：同行 attr: '中文' / state: / expId:（仅这三个是属性承载参数）
function isEffectParam(before) {
  const m = before.match(/(attr|state|expId)\s*[:=]\s*$/)
  return !!m
}

// 条件表达式：字面量含"根路径开头的点 token"（player./selected./target./character. 等）
const CONDITION_ROOT = /^(player|selected|target|character|location|game|quest|inventory|combat|experience|abilities|talents|status)\./
function hasRootedToken(literal) {
  const tokens = literal.split(/[<>=!&|()\s,]+/)
  return tokens.some(t => CONDITION_ROOT.test(t))
}
function isConditionLiteral(literal) {
  return hasRootedToken(literal)
}

// 引号字符串值（条件里的字符串字面量，如 location.name == "酒馆"）
function isStringValue(before) {
  return /(==|!=|>=|<=|=|in)\s*['"`]\s*$/.test(before.slice(-16)) ||
    /^\s*(==|!=|>=|<=|in)\s*$/.test(before.slice(-10))
}

// 条件路径 token 逐段核对：返回需要核对的中文段数组
function conditionSegs(literal) {
  const out = []
  // 去字符串值（"..." 与 '...' 内的内容不算字段）
  const noValues = literal.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, ' ')
  const tokens = noValues.split(/[<>=!&|()\s,]+/)
  for (const tok of tokens) {
    // 只核对根路径开头的 token（player.气血 / character.令狐冲.abilities.华山剑法）
    if (!CONDITION_ROOT.test(tok)) continue
    const parts = tok.split('.')
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i]
      if (!/[\u4e00-\u9fa5]/.test(seg)) continue
      // 实体 ID 位置段跳过：character.{id} / quest.{id} / inventory.{itemId}
      if (['character', 'quest', 'inventory'].includes(parts[i - 1])) continue
      // relations.{对方}.{类型} 结构路径（对方 ID 与关系类型都不查 attributes 定义集）
      if (parts[i - 1] === 'relations' || parts[i - 2] === 'relations') continue
      if (seg === '能力' || seg === '天赋') continue // 占位符段（abilities.{能力}）
      out.push(seg)
    }
  }
  return out
}

// ========== ATTR 常量展开 ==========
function expandAttrConstants() {
  const utilsPath = path.join(ROOT, 'src', 'core', 'entity-utils.ts')
  if (!fs.existsSync(utilsPath)) return new Map()
  const src = fs.readFileSync(utilsPath, 'utf8')
  const block = src.match(/export const ATTR\s*=\s*\{([\s\S]*?)\n\}/)
  if (!block) return new Map()
  const map = new Map()
  const re = /^\s*([A-Z0-9_]+)\s*:\s*'([^']+)'/gm
  let m
  while ((m = re.exec(block[1])) !== null) map.set(m[1], m[2])
  return map
}

// ========== 扫描 ==========
function scan() {
  const violations = []
  const unmatched = []
  const expansions = []
  const tsFiles = collectFiles(path.join(ROOT, 'src'), '.ts')
  const attrConsts = expandAttrConstants()

  for (const file of tsFiles) {
    const src = fs.readFileSync(file, 'utf8')
    // 中文字面量：不跨行（[^'"`\\\r\n] 排除换行）
    const literalRe = /(['"`])((?:[^'"`\\\r\n]|\\.)*?[\u4e00-\u9fa5](?:[^'"`\\\r\n]|\\.)*?)\1/g
    let lm
    while ((lm = literalRe.exec(src)) !== null) {
      const literal = lm[2]
      const at = lm.index
      if (inComment(src, at)) continue
      if (literal.includes('${')) continue
      const line = lineOf(src, at)
      const before = src.slice(0, at)
      const lineText = src.split('\n')[line - 1].trim()

      if (isStringValue(before)) continue // 条件里的字符串值（地点名等），非字段

      if (isConditionLiteral(literal)) {
        for (const seg of conditionSegs(literal)) {
          if (defined.has(seg) || STRUCTURAL_WHITELIST.has(seg)) continue
          violations.push({ file: rel(file), line, seg, ctx: lineText.slice(0, 110) })
        }
        continue
      }

      if (isCallArg(before) || isIndexAccess(before) || isEffectParam(before)) {
        // 结构命名空间索引（talents['天生神力'] / relations['player']['师徒值'] 等）非属性引用
        const chainRoot = isIndexAccess(before) ? indexChainRoot(before) : null
        if (chainRoot && STRUCTURAL_NS.has(chainRoot)) continue
        if (!defined.has(literal) && !STRUCTURAL_WHITELIST.has(literal)) {
          violations.push({ file: rel(file), line, seg: literal, ctx: lineText.slice(0, 110) })
        }
        continue
      }

      // 兜底：中文段逐个记录（UNMATCHED，人工三审）
      const segs = literal.split(/[.\s<>=!&|()]+/).filter(s => /[\u4e00-\u9fa5]/.test(s))
      for (const seg of segs) {
        if (defined.has(seg) || STRUCTURAL_WHITELIST.has(seg)) continue
        unmatched.push({ file: rel(file), line, seg, ctx: lineText.slice(0, 110) })
      }
    }

    // ATTR.XXX 展开
    const useRe = /\bATTR\.([A-Z0-9_]+)/g
    let um
    while ((um = useRe.exec(src)) !== null) {
      const key = um[1]
      const value = attrConsts.get(key)
      if (value === undefined) continue
      if (!defined.has(value)) {
        expansions.push({ file: rel(file), line: lineOf(src, um.index), key, value, ctx: src.split('\n')[lineOf(src, um.index) - 1].trim().slice(0, 110) })
      }
    }
  }

  return { violations, unmatched, expansions }
}

const { violations, unmatched, expansions } = scan()

function dedupe(arr) {
  const seen = new Set()
  return arr.filter(x => {
    const k = `${x.file}:${x.line}:${x.seg}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const v = dedupe(violations)
const u = dedupe(unmatched)
const e = dedupe(expansions)

const reportPathArg = process.argv.find(a => a.startsWith('--report='))
const reportPath = reportPathArg ? reportPathArg.slice('--report='.length) : null

if (reportPath) {
  const lines = []
  lines.push('# 第1层扫描报告（scan-attr-refs.cjs）')
  lines.push('')
  lines.push(`- 定义集合：attributes ${attrDefs.size} / abilities ${abilityDefs.size} / talents ${talentDefs.size} / status ${statusDefs.size} / relations ${relationDefs.size}`)
  lines.push(`- VIOLATION：${v.length}（属性上下文引用未定义 —— 必须修复到 0）`)
  lines.push(`- ATTR 展开违规：${e.length}`)
  lines.push(`- UNMATCHED：${u.length}（非属性上下文中文，人工三审，多为 UI/日志/数据值文本）`)
  lines.push('')
  if (v.length) {
    lines.push('## VIOLATION（必须修复）')
    lines.push('')
    lines.push('| 文件 | 行 | 引用 | 上下文 |')
    lines.push('|------|----|------|--------|')
    for (const x of v) lines.push(`| ${x.file} | ${x.line} | \`${x.seg}\` | \`${x.ctx}\` |`)
    lines.push('')
  }
  if (e.length) {
    lines.push('## ATTR 展开违规（常量值未定义）')
    lines.push('')
    lines.push('| 文件 | 行 | 常量 | 值 | 上下文 |')
    lines.push('|------|----|------|----|--------|')
    for (const x of e) lines.push(`| ${x.file} | ${x.line} | \`ATTR.${x.key}\` | \`${x.value}\` | \`${x.ctx}\` |`)
    lines.push('')
  }
  if (u.length) {
    lines.push('## UNMATCHED（人工三审）')
    lines.push('')
    lines.push('| 文件 | 行 | 引用 | 上下文 |')
    lines.push('|------|----|------|--------|')
    for (const x of u) lines.push(`| ${x.file} | ${x.line} | \`${x.seg}\` | \`${x.ctx}\` |`)
    lines.push('')
  }
  fs.writeFileSync(path.join(ROOT, reportPath), lines.join('\n'), 'utf8')
  console.log(`[scan-attr-refs] 报告已写入 ${reportPath}`)
}

console.log(`[scan-attr-refs] 定义集合: attributes=${attrDefs.size} abilities=${abilityDefs.size} talents=${talentDefs.size} status=${statusDefs.size} relations=${relationDefs.size}`)
console.log(`[scan-attr-refs] VIOLATION=${v.length} ATTR_EXPANSION_VIOLATION=${e.length} UNMATCHED=${u.length}`)
for (const x of v.slice(0, 100)) {
  console.log(`  VIOLATION ${x.file}:${x.line} 引用未定义名 '${x.seg}' — ${x.ctx}`)
}
for (const x of e.slice(0, 100)) {
  console.log(`  ATTR_EXPANSION ${x.file}:${x.line} ATTR.${x.key}='${x.value}' 未定义 — ${x.ctx}`)
}
if (process.argv.includes('--unmatched')) {
  for (const x of u) console.log(`  UNMATCHED ${x.file}:${x.line} '${x.seg}' — ${x.ctx}`)
}
process.exit(v.length + e.length > 0 ? 1 : 0)
