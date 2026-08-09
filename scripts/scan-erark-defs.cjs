#!/usr/bin/env node
/**
 * 第3层扫描：erArk 字段定义全集（A 骨架）↔ 我们迁移属性字段（权威）对账（标准角色契约 spec §10.1 Step 3）
 *
 * 方向：以我们迁移的属性字段为权威。erArk 字段我们可能 ①改名（映射表）②替代处理（换了机制表达）
 *   ③有意删减（已筛掉，标注理由）④遗漏（迁移会撞墙）。脚本只负责自动标记"引用无对应"，
 *   归入哪类必须人工确认——脚本判定不了设计决策。
 *
 * 输入：
 *   A 骨架 = erArk CSV 定义全集：CharacterState.csv / Experience.csv / Ability.csv / Talent.csv
 *            + game_type.py Character 结构体字段（硬编码清单，含 erArk 默认值）
 *   B 遗漏抓取源 = 228 保留指令效果链引用（InstructConfig.csv + Behavior_Effect.csv + keep-list
 *            + convert-erark-instructions.cjs EFFECT_MAP 抽取 attr/state/expId 引用）
 *   归一化 = scripts/erark-name-map.json（erarkToOurs / structuralSubstitutions / dropped）
 *   我们定义 = attributes.toml（插件默认+mod）/ abilities.toml / talents.toml / 结构命名空间
 *
 * 输出：
 *   JSON 对账结果（脚本标记）+ 人工确认后的四类判定写进 docs/instruction-replication/erark-attr-ledger.md
 *
 * 用法: node scripts/scan-erark-defs.cjs [--report=docs/instruction-replication/erark-attr-scan.json]
 */
const fs = require('fs')
const path = require('path')
const TOML = require('@iarna/toml')

const ROOT = path.resolve(__dirname, '..')
const ERA_CSV = path.join(ROOT, '用来复刻的蓝本游戏 erArk 不要commit', 'data', 'csv')

// ========== CSV 读取（erArk CSV 前 4 行是表头注释，第 5 行起是数据）==========
function readCsv(relPath) {
  const abs = path.join(ERA_CSV, relPath)
  if (!fs.existsSync(abs)) {
    console.error(`[scan-erark-defs] 缺少 ${relPath}`)
    return []
  }
  const text = fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  const rows = []
  for (let i = 4; i < lines.length; i++) {
    // 简单 CSV 解析（无引号内逗号场景——这些 CSV 均无）
    const cols = lines[i].split(',')
    rows.push(cols)
  }
  return rows
}

function readCsvAsObject(relPath, keyCol, valueCol) {
  const out = []
  for (const row of readCsv(relPath)) {
    const key = row[keyCol]?.trim()
    const value = row[valueCol]?.trim()
    if (key === undefined || key === '') continue
    // 跳过表头/表名等非数据行（id 应为数字）
    if (!/^\d+$/.test(key)) continue
    out.push({ id: key, name: value ?? '' })
  }
  return out
}

// ========== 我们定义集合 ==========
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
      console.error(`[scan-erark-defs] TOML 解析失败: ${rel} — ${e.message}`)
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
      } else if (entry.name.endsWith(ext)) out.push(full)
    }
  }
  walk(dir)
  return out
}
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/')
const pluginDefs = (name) => collectFiles(path.join(ROOT, 'src', 'plugins'), name).filter(p => p.includes('data' + path.sep + 'default')).map(rel)
const modDefs = (name) => collectFiles(path.join(ROOT, 'mods'), name).map(rel)
const ourAttrs = loadTomlKeys([...pluginDefs('attributes.toml'), ...modDefs('attributes.toml')], 'attributes')
const ourAbilities = loadTomlKeys([...pluginDefs('abilities.toml'), ...modDefs('abilities.toml')], 'abilities')
const ourTalents = loadTomlKeys([...pluginDefs('talents.toml'), ...modDefs('talents.toml')], 'talents')
const ourDefined = new Set([...ourAttrs, ...ourAbilities, ...ourTalents])

// ========== 归一化映射表 ==========
const nameMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'erark-name-map.json'), 'utf8'))
const erarkToOurs = nameMap.erarkToOurs
const structural = nameMap.structuralSubstitutions
const dropped = nameMap.dropped

// ========== A 骨架：erArk 定义全集 ==========
const erarkStates = readCsvAsObject('CharacterState.csv', 0, 1)
const erarkAbilities = readCsvAsObject('Ability.csv', 0, 2)
const erarkExperiences = readCsvAsObject('Experience.csv', 0, 1)
const erarkTalents = readCsvAsObject('Talent.csv', 0, 2)

// game_type.py Character 结构体基础字段（id/默认值/说明）——手工维护清单
// ours = 我们的对应属性名（经映射表归一后的最终名）；classification 直接标注四类判定
// （字段名 = erArk 原名，默认值来自 game_type.py __init__）
const characterStructFields = [
  { name: 'hit_point', ours: '体力', note: '体力（当前）' },
  { name: 'hit_point_max', ours: '体力上限', note: '体力上限' },
  { name: 'mana_point', ours: '气力', note: '气力（当前）' },
  { name: 'mana_point_max', ours: '气力上限', note: '气力上限' },
  { name: 'sanity_point', ours: '精力', note: '理智（当前）→ 精力（语义近似，精力为闲置属性）' },
  { name: 'sanity_point_max', classification: '有意删减', note: '理智上限——未迁移（精力无上限属性；h-hypnosis 精神 100 钳制为自研机制）' },
  { name: 'eja_point', ours: '射精欲', note: '射精槽（当前）' },
  { name: 'eja_point_max', ours: '射精欲上限', note: '射精槽上限' },
  { name: 'semen_point', ours: '精液量', note: '精液槽（当前）' },
  { name: 'semen_point_max', ours: '精液量上限', note: '精液槽上限（上限 999，erArk 同）' },
  { name: 'tem_extra_semen_point', ours: '额外精液量', note: '临时最大精液槽' },
  { name: 'angry_point', ours: '愤怒', note: '愤怒槽' },
  { name: 'tired_point', ours: '疲劳度', note: '疲劳值（erArk 6m=1点，16h=160 max）' },
  { name: 'urinate_point', ours: '尿意', note: '尿意值（erArk 1m=1点，4h=240 max）' },
  { name: 'hunger_point', ours: '饥饿值', note: '饥饿值（erArk 1m=1点，4h=240 max）' },
  { name: 'sleep_point', ours: '熟睡值', note: '熟睡值（erArk 1m=10点，10min=100 max）' },
  { name: 'desire_point', ours: '欲望值', note: '欲望值（百分比 100 max）' },
  { name: 'drunk_point', ours: '酒气', note: '醉酒度（百分比 100 max）' },
  { name: 'favorability', classification: '替代处理', note: '好感度字典 → 单值属性 好感度（entity.base.好感度）' },
  { name: 'trust', ours: '信赖度', note: '信赖度（float，封顶 300 进 SettlementContext 钳制）' },
  { name: 'ability', classification: '替代处理', note: '能力字典 → entity.abilities.{名} = {level, xp}' },
  { name: 'experience', classification: '替代处理', note: '经验字典 → entity.experience（数值 id 直通）' },
  { name: 'talent', classification: '替代处理', note: '素质字典 → entity.talents.{名}' },
  { name: 'status_data', classification: '替代处理', note: '状态字典 → entity.params（attributes.toml category=parameter）' },
  { name: 'sp_flag', classification: '替代处理', note: '特殊 flag → entity.sp_flag（字段名一致）' },
  { name: 'h_state', classification: '替代处理', note: 'H 状态 → entity.h_state（字段名一致）' },
  { name: 'dirty', classification: '替代处理', note: '污浊 → entity.dirty（body_semen/cloth_semen/penis_dirty_dict 等）' },
  { name: 'first_record', classification: '替代处理', note: '初次记录 → entity.first_record（h-first-time 维护）' },
  { name: 'pregnancy', classification: '替代处理', note: '怀孕 → entity.pregnancy（h-pregnancy 维护；排卵周期在 base）' },
  { name: 'hypnosis', classification: '替代处理', note: '催眠 → entity.hypnosis（h-hypnosis 维护；精神在 base）' },
  { name: 'action_info', classification: '替代处理', note: '行动记录 → entity.action_info（字段名一致）' },
  { name: 'body_item', classification: '替代处理', note: '身体道具 → entity.body_items（h-core 读取）' },
  { name: 'cloth', classification: '替代处理', note: '服装 → entity.cloth（clothing-system）' },
  { name: 'relationship', classification: '替代处理', note: '社会关系 → entity.relations（relations.toml 定义关系类型）' },
  { name: 'juel', classification: '有意删减', note: '宝珠 → 收藏系统砍掉，不迁移' },
  { name: 'collection_character', classification: '有意删减', note: '收藏角色 → 收藏系统砍掉，不迁移' },
  { name: 'pl_ability', classification: '有意删减', note: '玩家能力 → 玩家技能树（激素/透视/催眠/时停），随 B 批次评估（h-hypnosis/h-time-stop 已有运行时字段）' },
  { name: 'pl_collection', classification: '有意删减', note: '玩家收藏品 → 收藏系统砍掉，不迁移' },
  { name: 'work', classification: '有意删减', note: '工作信息 → 方舟基建系统砍掉，不迁移' },
  { name: 'entertainment', classification: '有意删减', note: '娱乐信息 → 随 B 批次评估（唱歌/读书等指令仅用经验，无娱乐结构）' },
  { name: 'author_flag', classification: '有意删减', note: '口上作者变量 → 不迁移（口上系统用独立机制）' },
  { name: 'profession', classification: '有意删减', note: '职业 → 世界观数据，不迁移' },
  { name: 'race', classification: '有意删减', note: '种族 → 世界观数据（兽人等），不迁移' },
  { name: 'token_text', classification: '有意删减', note: '信物文本 → 收藏系统砍掉，不迁移' },
  { name: 'assistant_character_id', classification: '有意删减', note: '助理 → 助理系统砍掉，不迁移' },
  { name: 'chara_setting', classification: '有意删减', note: '角色个人设置 → 设置面板未迁移' },
  { name: 'assistant_services', classification: '有意删减', note: '助理服务 → 助理系统砍掉，不迁移' },
  { name: 'body_manage', classification: '有意删减', note: '身体管理 → 体检系统砍掉，不迁移' },
]

// ========== B 遗漏抓取源：228 保留指令效果链引用 ==========
function extractKeptIds() {
  const keepListPath = path.join(ROOT, 'docs', 'instruction-replication', 'instruction-keep-list.md')
  if (!fs.existsSync(keepListPath)) return new Set()
  const text = fs.readFileSync(keepListPath, 'utf8')
  const ids = new Set()
  // 表格行: | cid | id | 名称 | ...
  const re = /^\|\s*\d+\s*\|\s*([a-z][a-z0-9_]*)\s*\|/gm
  let m
  while ((m = re.exec(text)) !== null) ids.add(m[1])
  return ids
}

// InstructConfig: instruct_id → { cid, behavior_id }
function loadInstructConfig() {
  const map = new Map()
  for (const row of readCsv('InstructConfig.csv')) {
    if (row.length < 8) continue
    const instructId = row[1]?.trim()
    const behaviorId = row[8]?.trim()
    if (!instructId || !behaviorId) continue
    map.set(instructId, { cid: row[0]?.trim(), behaviorId })
  }
  return map
}

// Behavior_Effect: behavior_id → effect_ids[]（effect_id 列是 ' - ' 分隔的整条链）
// behavior_id 大小写不一致（InstructConfig 大写 CHAT / Behavior_Effect 小写 chat）→ 统一小写
function loadBehaviorEffects() {
  const map = new Map()
  for (const row of readCsv('Behavior_Effect.csv')) {
    if (row.length < 3) continue
    const behaviorId = row[1]?.trim().toLowerCase()
    const chain = row[2]?.trim()
    if (!behaviorId || !chain) continue
    if (!map.has(behaviorId)) map.set(behaviorId, [])
    for (const effectId of chain.split(/\s*-\s*/)) {
      if (effectId) map.get(behaviorId).push(effectId)
    }
  }
  return map
}

// 抽取 convert-erark-instructions.cjs 的 effect id → {attr/state/expId/part} 引用
// 全文件四种写法都吃：① 对象字面量条目 `123: {...}`（EFFECT_MAP/clothMap/expMap 等）
// ② if (numId === X) return {...} ③ 字符串值 map `122: '阴道'`（partMap/skillMap）
// ④ 区间块 `if (numId >= A && numId <= B) { return ... }`（区间内 id 视为已映射）。
// 花括号平衡匹配，嵌套对象完整捕获。
function loadEffectMap() {
  const convPath = path.join(ROOT, 'scripts', 'convert-erark-instructions.cjs')
  const src = fs.readFileSync(convPath, 'utf8')
  const map = new Map() // effectId → { attr?, state?, expId?, part? }
  const ranges = []     // [low, high, inclusive]

  const parseBody = (id, body) => {
    map.set(id, {})
    const attr = body.match(/\battr:\s*'([^']+)'/)
    if (attr) map.get(id).attr = attr[1]
    const state = body.match(/\bstate:\s*'([^']+)'/)
    if (state) map.get(id).state = state[1]
    const expId = body.match(/\bexpId:\s*'([^']+)'/)
    if (expId) map.get(id).expId = expId[1]
    const part = body.match(/\bpart:\s*'([^']+)'/)
    if (part) map.get(id).part = part[1]
  }

  const grabBalanced = (openIdx) => {
    let depth = 1
    let i = openIdx + 1
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') depth--
      i++
    }
    return src.slice(openIdx + 1, i - 1)
  }

  // ① 对象字面量条目（跨行）：^\s*(\d+):\s*{
  const entryRe = /^\s*(\d+):\s*\{/gm
  let m
  while ((m = entryRe.exec(src)) !== null) {
    const body = grabBalanced(m.index + m[0].length - 1)
    parseBody(m[1], body)
  }
  // ② if (numId === X) return {
  const ifRe = /if\s*\(numId\s*===\s*(\d+)\)\s*return\s*\{/g
  let im
  while ((im = ifRe.exec(src)) !== null) {
    const body = grabBalanced(im.index + im[0].length - 1)
    parseBody(im[1], body)
  }
  // ③ 字符串值 map（partMap/skillMap）：`122: '阴道'`
  const strMapRe = /^\s*(\d+):\s*'([^']+)'/gm
  let sm
  while ((sm = strMapRe.exec(src)) !== null) {
    parseBody(sm[1], `part: '${sm[2]}'`)
  }
  // ④ 区间块（id 落在区间内视为已映射）
  const rangeRe = /if\s*\(numId\s*>=\s*(\d+)\s*&&\s*numId\s*(?:<|<=)\s*(\d+)\)\s*\{/g
  let rm
  while ((rm = rangeRe.exec(src)) !== null) {
    const low = Number(rm[1])
    const high = Number(rm[2])
    ranges.push([low, high])
  }
  return {
    map,
    byName: new Map(),
    isMapped: (id) => {
      const n = Number(id)
      if (Number.isNaN(n)) return map.has(id)
      if (map.has(id)) return true
      return ranges.some(([low, high]) => n >= low && n <= high)
    },
  }
}

// 保留指令的效果链 → 引用的字段集合 + 未映射效果 id 集合
function collectKeptInstructionRefs() {
  const keptIds = extractKeptIds()
  const instructConfig = loadInstructConfig()
  const behaviorEffects = loadBehaviorEffects()
  const { map: effectMap, isMapped } = loadEffectMap()

  const refs = new Map()      // 字段名（我们名/exp 数值）→ Set<指令 id>
  const unmappedEffects = new Map() // effectId → Set<指令 id>
  const keptBehaviors = new Set()

  for (const [instructId, info] of instructConfig) {
    if (!keptIds.has(instructId)) continue
    const chain = behaviorEffects.get(info.behaviorId.toLowerCase()) ?? []
    if (chain.length) keptBehaviors.add(`${instructId}(${info.behaviorId})`)
    for (const effectId of chain) {
      // CVE 前缀：CVE_A{1,2}_E|{expId}_G_{n} → 经验引用
      const cve = effectId.match(/^CVE_A\d_E\|(\d+)_G_\d+/)
      if (cve) {
        addRef(refs, `experience.${cve[1]}`, instructId)
        continue
      }
      if (effectMap.has(effectId)) {
        const ref = effectMap.get(effectId)
        if (ref.attr) addRef(refs, ref.attr, instructId)
        if (ref.state) addRef(refs, ref.state, instructId)
        if (ref.expId) addRef(refs, `experience.${ref.expId}`, instructId)
        if (ref.part) addRef(refs, ref.part, instructId)
      } else if (!isMapped(effectId)) {
        if (!unmappedEffects.has(effectId)) unmappedEffects.set(effectId, new Set())
        unmappedEffects.get(effectId).add(instructId)
      }
    }
  }
  return { refs, unmappedEffects, keptBehaviors, keptCount: keptIds.size }
}

function addRef(refs, name, instructId) {
  if (!refs.has(name)) refs.set(name, new Set())
  refs.get(name).add(instructId)
}

// ========== 对账分类 ==========
function classify(name, source, id, ourDefined, extra) {
  const normalized = erarkToOurs[name] ?? name
  if (ourDefined.has(normalized) || ourDefined.has(name)) {
    return { classification: '已对齐', normalized: ourDefined.has(normalized) ? normalized : name, note: extra?.note ?? '' }
  }
  if (structural[name]) {
    return { classification: '替代处理', normalized: null, note: structural[name] }
  }
  if (dropped[name]) {
    return { classification: '有意删减', normalized: null, note: dropped[name] }
  }
  return { classification: '遗漏', normalized, note: extra?.note ?? '' }
}

function buildLedgerRows() {
  const { refs, unmappedEffects, keptCount } = collectKeptInstructionRefs()
  const rows = []
  const needed = (name) => {
    const insts = refs.get(name)
    return insts ? [...insts].slice(0, 8).join(', ') : null
  }
  const expNeeded = (id) => {
    const insts = refs.get(`experience.${id}`)
    return insts ? [...insts].slice(0, 8).join(', ') : null
  }

  for (const s of erarkStates) {
    const r = classify(s.name, 'CharacterState', s.id, ourDefined)
    rows.push({ id: s.id, erarkName: s.name, source: 'CharacterState', ...r, neededBy: needed(s.name) })
  }
  for (const a of erarkAbilities) {
    const r = classify(a.name, 'Ability', a.id, ourDefined)
    rows.push({ id: a.id, erarkName: a.name, source: 'Ability', ...r, neededBy: needed(a.name) })
  }
  for (const e of erarkExperiences) {
    // 经验：数值 id 直通（我们 entity.experience 用 erArk 数值 id）
    const normalized = erarkToOurs[e.name] ?? e.name
    const isDropped = !!dropped[e.name] || e.name.includes('兽部') || (e.name.includes('尿道') && e.name.includes('经验'))
    rows.push({
      id: e.id, erarkName: e.name, source: 'Experience',
      classification: isDropped ? '有意删减' : '已对齐',
      normalized: isDropped ? null : `experience.${e.id}（数值 id 直通，显示名 ${normalized}）`,
      note: isDropped ? (dropped[e.name] ?? '部位全砍（兽部/尿道），经验不迁移') : '',
      neededBy: expNeeded(e.id),
    })
  }
  for (const t of erarkTalents) {
    const r = classify(t.name, 'CharacterTalent', t.id, ourDefined)
    rows.push({ id: t.id, erarkName: t.name, source: 'CharacterTalent', ...r, neededBy: needed(t.name) })
  }
  // game_type Character 结构体字段
  for (const f of characterStructFields) {
    let r
    if (f.ours) {
      r = { classification: '已对齐', normalized: f.ours, note: f.note }
    } else if (f.classification) {
      r = { classification: f.classification, normalized: null, note: f.note }
    } else {
      r = classify(f.name, 'Character', f.name, ourDefined)
      r.note = r.note ? `${r.note}；${f.note}` : f.note
    }
    rows.push({ id: f.name, erarkName: f.name, source: 'Character', ...r, neededBy: null })
  }

  return { rows, unmappedEffects, keptCount }
}

// ========== 转换脚本属性引用校验（防死键映射回归）==========
// 2026-08-09 第5轮：发现 convert-erark-instructions.cjs 6 处错误映射
// （457/489/509/703/931/932 → attr='睡意/疲劳/欲望/饥饿' 死键或语义错误）——
// 固化校验：转换脚本所有 attr/state/part 值必须 ∈ 定义集（attributes.toml 合并），
// 未定义的列出（人工三审：可能是服装部位名等非属性）
function checkConverterRefs() {
  const convPath = path.join(ROOT, 'scripts', 'convert-erark-instructions.cjs')
  if (!fs.existsSync(convPath)) return []
  const src = fs.readFileSync(convPath, 'utf8')
  const issues = []
  const attrVals = [...new Set([...src.matchAll(/attr:\s*'([^']+)'/g)].map(m => m[1]))]
  const stateVals = [...new Set([...src.matchAll(/state:\s*'([^']+)'/g)].map(m => m[1]))]
  const partVals = [...new Set([...src.matchAll(/part:\s*'([^']+)'/g)].map(m => m[1]))]
  const defined = new Set([...ourAttrs, ...ourAbilities, ...ourTalents])
  // 服装部位名（cloth_set_visible 等服装系统效果，非属性——白名单）
  const CLOTH_PARTS = new Set(['内衣', '胸罩', '内裤', '浴巾', '睡衣', 'all'])
  for (const a of attrVals) {
    if (!defined.has(a)) issues.push(`attr '${a}' 未定义（attributes.toml 无此属性）`)
  }
  for (const s of stateVals) {
    if (!defined.has(s)) issues.push(`state '${s}' 未定义（attributes.toml 无此属性）`)
  }
  for (const p of partVals) {
    if (!defined.has(p) && !CLOTH_PARTS.has(p)) issues.push(`part '${p}' 未定义且非服装部位名`)
  }
  return issues
}
const { rows, unmappedEffects, keptCount } = buildLedgerRows()

const converterIssues = checkConverterRefs()

const byClass = {}
for (const r of rows) {
  byClass[r.classification] = (byClass[r.classification] ?? 0) + 1
}

// ---- 对账表 markdown 生成（--ledger=path，人工确认后的权威文档）----
const ledgerPathArg = process.argv.find(a => a.startsWith('--ledger='))
if (ledgerPathArg) {
  const lines = []
  lines.push('# erArk 属性字段对账表（迁移期对照字典）')
  lines.push('')
  lines.push('> **生命周期 = 迁移期**：spec §11 收尾与 `erark_id` 字段一并归档。')
  lines.push('> **方向（权威）**：以我们迁移的属性字段为权威。erArk 字段我们可能 ①改名（映射表）②替代处理（换了机制表达）③有意删减（已筛掉，标注理由防误补——激素教训）④遗漏（迁移会撞墙，需补定义）。')
  lines.push('> **骨架（A）** = erArk 定义全集（CharacterState / Experience / Ability / CharacterTalent + game_type.Character 结构体）。')
  lines.push('> **遗漏抓取源（B）** = 228 保留指令效果链引用（经映射表归一；`保留指令引用` 列 = B 命中）。')
  lines.push(`> 生成：scripts/scan-erark-defs.cjs --ledger（${new Date().toLocaleDateString('sv-SE')}）。脚本只自动标记，四类判定由人工确认后固化为本文。`)
  lines.push('')
  lines.push('## 统计')
  lines.push('')
  lines.push(`| 归类 | 数量 | 说明 |`)
  lines.push(`|------|------|------|`)
  lines.push(`| 已对齐 | ${byClass['已对齐'] ?? 0} | 直接对应（含改名映射，指向 scripts/erark-name-map.json） |`)
  lines.push(`| 替代处理 | ${byClass['替代处理'] ?? 0} | 结构差异或换机制表达，指向实现位置 |`)
  lines.push(`| 有意删减 | ${byClass['有意删减'] ?? 0} | 手动过滤掉的（世界观/系统未实装/简化），标注理由 |`)
  lines.push(`| 遗漏 | ${byClass['遗漏'] ?? 0} | erArk 引用而我们无对应（人工确认后应为 0，需补的进 attributes/abilities） |`)
  lines.push('')
  lines.push('## 四类判定明细')
  lines.push('')
  lines.push('### 1. 已对齐（含改名映射）')
  lines.push('')
  lines.push('| erArk 字段 | erArk id | 来源 | 处理方式（我们的字段） | 保留指令引用 |')
  lines.push('|-----------|----------|------|------------------------|--------------|')
  for (const r of rows.filter(r => r.classification === '已对齐')) {
    const norm = r.normalized ?? r.erarkName
    lines.push(`| ${r.erarkName} | ${r.id} | ${r.source} | \`${norm}\`${r.note ? ' — ' + r.note : ''} | ${r.neededBy ?? ''} |`)
  }
  lines.push('')
  lines.push('### 2. 替代处理')
  lines.push('')
  lines.push('| erArk 字段 | erArk id | 来源 | 处理方式（实现位置） | 保留指令引用 |')
  lines.push('|-----------|----------|------|----------------------|--------------|')
  for (const r of rows.filter(r => r.classification === '替代处理')) {
    lines.push(`| ${r.erarkName} | ${r.id} | ${r.source} | ${r.note} | ${r.neededBy ?? ''} |`)
  }
  lines.push('')
  lines.push('### 3. 有意删减（标注理由，防误补）')
  lines.push('')
  lines.push('| erArk 字段 | erArk id | 来源 | 删减理由 |')
  lines.push('|-----------|----------|------|----------|')
  for (const r of rows.filter(r => r.classification === '有意删减')) {
    lines.push(`| ${r.erarkName} | ${r.id} | ${r.source} | ${r.note} |`)
  }
  lines.push('')
  lines.push('### 4. 遗漏（人工确认后应为 0；有遗漏时列出待补项）')
  lines.push('')
  const missing = rows.filter(r => r.classification === '遗漏')
  if (missing.length === 0) {
    lines.push('无。所有 erArk 字段均有对应处理。')
  } else {
    lines.push('| erArk 字段 | erArk id | 来源 | 被保留指令引用 | 待办 |')
    lines.push('|-----------|----------|------|----------------|------|')
    for (const r of missing) {
      lines.push(`| ${r.erarkName} | ${r.id} | ${r.source} | ${r.neededBy ?? ''} | 待人工确认：补定义（含 erArk 默认值）或改代码 |`)
    }
  }
  lines.push('')
  lines.push('## 附：保留指令效果链中未映射的 effect id')
  lines.push('')
  if (unmappedEffects.size === 0) {
    lines.push('无（convert-erark-instructions.cjs 已覆盖全部 effect id 映射）。')
  } else {
    // 人工查证过的未映射 id（default.py 已核对语义，防止迁移时重新撞墙）
    const VERIFIED = {
      '1723': '**已查证（default.py:2707）**：`action_info.carry_chara_id = target_character_id`——ARTS 搬运指令（B2+ 批次）迁移时需专用 handler（set_field 只写 _targetIds，无法表达"玩家写自己"；不可用 set_field 替代）',
      '1724': '**已查证（default.py:2730）**：`action_info.carry_chara_id = 0`——同上，需专用 handler',
    }
    lines.push('| effect id | 被指令使用 | 待办 |')
    lines.push('|-----------|------------|------|')
    for (const [id, insts] of unmappedEffects) {
      lines.push(`| ${id} | ${[...insts].slice(0, 8).join(', ')} | ${VERIFIED[id] ?? '两步路径翻译（constant_effect.py → default.py）'} |`)
    }
  }
  lines.push('')
  const out = ledgerPathArg.slice('--ledger='.length)
  fs.writeFileSync(path.join(ROOT, out), lines.join('\n'), 'utf8')
  console.log(`[scan-erark-defs] 对账表已写入 ${out}`)
}

const reportPathArg = process.argv.find(a => a.startsWith('--report='))
if (reportPathArg) {
  const report = {
    generatedAt: new Date().toISOString().slice(0, 10),
    authority: '以我们迁移的属性字段为权威（attributes/abilities/talents.toml）',
    definitionSets: {
      ourAttrs: ourAttrs.size, ourAbilities: ourAbilities.size, ourTalents: ourTalents.size,
      erarkStates: erarkStates.length, erarkAbilities: erarkAbilities.length,
      erarkExperiences: erarkExperiences.length, erarkTalents: erarkTalents.length,
      keptInstructions: keptCount,
    },
    classificationCounts: byClass,
    rows,
    unmappedEffects: [...unmappedEffects.entries()].map(([id, insts]) => ({ effectId: id, usedBy: [...insts].slice(0, 8) })),
    unmappedEffectCount: unmappedEffects.size,
  }
  const out = reportPathArg.slice('--report='.length)
  fs.writeFileSync(path.join(ROOT, out), JSON.stringify(report, null, 2), 'utf8')
  console.log(`[scan-erark-defs] 报告已写入 ${out}`)
}

console.log(`[scan-erark-defs] erArk 全集: states=${erarkStates.length} abilities=${erarkAbilities.length} experiences=${erarkExperiences.length} talents=${erarkTalents.length} + Character结构体=${characterStructFields.length}`)
console.log(`[scan-erark-defs] 我们定义: attributes=${ourAttrs.size} abilities=${ourAbilities.size} talents=${ourTalents.size}`)
console.log(`[scan-erark-defs] 保留指令: ${keptCount}，分类: ${JSON.stringify(byClass)}`)
console.log(`[scan-erark-defs] 保留指令效果链未映射 effect id: ${unmappedEffects.size} 个`)
console.log(`[scan-erark-defs] 转换脚本 attr/state/part 引用校验: ${converterIssues.length === 0 ? '全部已定义 ✓' : converterIssues.length + ' 个问题'}`)
for (const issue of converterIssues) {
  console.log(`  转换脚本引用问题: ${issue}`)
}
console.log('--- 遗漏候选（需人工确认）---')
for (const r of rows.filter(r => r.classification === '遗漏')) {
  console.log(`  [遗漏] ${r.source}#${r.id} ${r.erarkName} → 无对应${r.neededBy ? `（被指令引用: ${r.neededBy}）` : ''}`)
}
console.log('--- 有意删减 ---')
for (const r of rows.filter(r => r.classification === '有意删减')) {
  console.log(`  [删减] ${r.source}#${r.id} ${r.erarkName} — ${(r.note ?? '').slice(0, 60)}`)
}
console.log('--- 未映射 effect id（保留指令链用到，转换脚本未覆盖）---')
for (const [id, insts] of unmappedEffects) {
  console.log(`  effect ${id} 被 ${[...insts].slice(0, 6).join(', ')} 使用`)
}
