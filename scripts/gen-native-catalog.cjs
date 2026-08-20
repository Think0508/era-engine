#!/usr/bin/env node
// 原生词条速查表生成器（native entries catalog generator）
//
// 扫描范围 = 引擎实际加载的原生默认层：src/plugins/*/data/default/**/*.toml
//   （与 src/core/mod-loader.ts 的 import.meta.glob 一致；mod 层不在本工具范围）
//
// 用途：
//   1. 知道现在有什么——每类词条的完整清单 + 数量（汇总表 + 分组小计）
//   2. 方便新增——每类给"添加新词条"的可复制 TOML 模板 + 归属文件 + 消费方
//   3. 方便维护——查重（同类别跨文件重复 ID）+ 悬空引用校验（如天赋获得规则
//      引用不存在的能力/天赋），`--check` 退出码 1 即发现有错，问题定位到 文件+ID
//
// 扩展性：所有词条类目由下方 CATEGORIES 注册表驱动。要新增一类"能新加的简单词条"
//   （如 roleplay 台词、指令清单），只需在 CATEGORIES 加一条 {match, container,
//   groupBy, keyFields, template, note, validate?}，重跑即自动出新表——不用改生成逻辑。
//
// 用法:
//   node scripts/gen-native-catalog.cjs                 # 生成 docs/native-entries-catalog.md
//   node scripts/gen-native-catalog.cjs --check         # 只校验不写盘（CI 用）
//   node scripts/gen-native-catalog.cjs --report=<path> # 指定输出路径
// 退出码: 1 = 有解析错误 / 重复 ID / 悬空引用
const fs = require('fs')
const path = require('path')
const TOML = require('@iarna/toml')

const ROOT = path.resolve(__dirname, '..')
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/')
const DEFAULT_REPORT = path.join(ROOT, 'docs', 'native-entries-catalog.md')

// ---------- 参数 ----------
const argv = process.argv.slice(2)
let checkOnly = false
let reportPath = DEFAULT_REPORT
for (const a of argv) {
  if (a === '--check') checkOnly = true
  else if (a.startsWith('--report=')) reportPath = path.resolve(ROOT, a.slice('--report='.length))
  else if (a.startsWith('--out=')) reportPath = path.resolve(ROOT, a.slice('--out='.length))
}

// ---------- 扫描全部默认层 TOML ----------
const allFiles = []
{
  const root = path.join(ROOT, 'src', 'plugins')
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, e.name)
      if (e.isDirectory()) walk(fp)
      else if (e.name.endsWith('.toml') && /[/\\]data[/\\]default[/\\]/.test(fp)) allFiles.push(fp)
    }
  }
  walk(root)
}

const shortPath = (p) => {
  const r = rel(p)
  const m = r.match(/^src\/plugins\/([^/]+)\/data\/default\/(.+)$/)
  return m ? `${m[1]}/${m[2]}` : r
}

// ---------- 词条类目注册表（扩展点：新增类目 = 加一条） ----------
// container: (data) => object-map（[key]表）或 array（[[key]]表）
// entryId:   (key, entry) => 词条 ID（object-map 用 key；数组用 entry.id/name）
// groupBy / keyFields 从 entry 提取表格列
const CATEGORIES = [
  // ═══ 天赋 talents ═══
  {
    id: 'talents',
    title: '天赋 talents',
    match: (f) => path.basename(f) === 'talents.toml',
    containerKey: 'talents',
    isArray: false,
    groupBy: (e) => e.tags?.[0] || '—',
    keyFields: (e) => {
      const bits = [`max=${e.max ?? '—'}`]
      if (e.favorite_position != null) bits.push(`体位偏好#${e.favorite_position}`)
      if (e.state_adjusts?.length) bits.push(`state×${e.state_adjusts.length}`)
      if (e.favorability_adjusts?.length) bits.push(`favor×${e.favorability_adjusts.length}`)
      if (e.gain) bits.push('gain')
      return bits.join(' · ')
    },
    container: (d) => d.talents,
    template: `[talents."新天赋"]
name = "新天赋"
max = 1
description = "一句话说明（引擎不消费，仅文档）"
tags = ["性素质"]   # 性素质/身体素质/精神素质/技术素质/其他素质
# 可选：state_adjusts / favorability_adjusts / favorite_position / gain（gain-rule-system 语法糖）`,
    note: `h-core/data/default/talents.toml ·
标签分组见输出；gain 语法糖编译进 gain-rule-system；mod 可 override`,
  },

  // ═══ 关系 relations（特殊：types / pairs / groups 三子表） ═══
  {
    id: 'relations',
    title: '关系 relations',
    match: (f) => path.basename(f) === 'relations.toml',
    isRelation: true,
    template: `[types."新关系类型"]
# kind=relation（三档 正/中/负）：
#   对称型："夫妻" = { kind = "relation", pair = "spouse" }
#   端对型："父母子女（为大）" = { kind = "relation", pair = "parent_child", side = "big" }
#   纯类型："仇人" = { kind = "relation", reverse = "被仇" }
# kind=sentiment（数值）：
#   "新好感度" = { kind = "sentiment", min = 0, max = 100, default = 30 }

[pairs.新词表]        # 新增称呼词表（panel 成对名 + address 单方称呼）
panel = { big_male = "X", big_female = "X", small_male = "x", small_female = "x" }

[groups]               # 新增关系组（元素 = 类型名 或 { pair = "词表" }）
"新组" = ["已定义类型", { pair = "parent_child" }]`,
    note: `h-core/data/default/relations.toml ·
关系有向，端对×端；groups 引用未定义 pair/类型 → 校验报错；mod 可覆盖/新增`,
  },

  // ═══ 能力 abilities ═══
  {
    id: 'abilities',
    title: '能力 abilities',
    match: (f) => path.basename(f) === 'abilities.toml',
    containerKey: 'abilities',
    isArray: false,
    groupBy: (e) => e.tags?.[0] || '—',
    keyFields: (e) => `type=${e.type ?? '—'} · max=${e.max_level ?? '—'}`,
    container: (d) => d.abilities,
    template: `[abilities."新能力"]
name = "新能力"
type = "passive"        # passive/active/...
max_level = 8
tags = ["sensation"]    # 标签决定升级/消费分组`,
    note: `h-core/data/default/abilities.toml ·
带等级的一切（感度/扩张/ABL/刻印/技术）；升级路径另见 ability-upgrades`,
  },

  // ═══ 能力升级表 ability-upgrades ═══
  {
    id: 'ability-upgrades',
    title: '能力升级表 ability-upgrades',
    match: (f) => path.basename(f) === 'ability-upgrades.toml',
    containerKey: 'abilities',
    isArray: false,
    groupBy: () => 'condition',
    keyFields: (e) => `mode=${e.mode ?? '—'} · 升${(e.upgrades || []).length}级 · sex=${e.sex_need ?? '—'}`,
    container: (d) => d.abilities,
    template: `[abilities."既有能力名"]
mode = "condition"
sex_need = -1
[[abilities."既有能力名".upgrades]]
needs = [{ type = "juel", id = 0, value = 125 }, { type = "experience", id = 0, value = 5 }]`,
    note: `h-core/data/default/ability-upgrades.toml（生成文件，勿手改）·
仅声明已存在能力的条件升级路径；needs 里 juel→实绩、ability→能力 会被校验`,
  },

  // ═══ 属性 attributes ═══
  {
    id: 'attributes',
    title: '属性 attributes',
    match: (f) => path.basename(f) === 'attributes.toml',
    containerKey: 'attributes',
    isArray: false,
    groupBy: (e) => e.category || '—',
    keyFields: (e) => {
      const bits = [`type=${e.type ?? '—'}`, `def=${e.default ?? '—'}`]
      if (e.display) bits.push(`显示[${e.display_group ?? '未分组'}]`)
      if (e.daily_reset) bits.push('每日重置')
      return bits.join(' · ')
    },
    container: (d) => d.attributes,
    template: `"新属性" = { type = "number", default = 0, category = "base", display = true, display_group = "status" }
# category: base/parameter/combat/...；parameter 可加 daily_reset=true
# 绑定系统：插件 required_attributes 用 bindings.toml 映射到本属性`,
    note: `h-core + combat-wuxia 两处 attributes.toml ·
定义权威：条件字段 player.{属性}/character.{ID}.{属性} 自动生成；绑定同名`,
  },

  // ═══ 状态效果 status-effects ═══
  {
    id: 'status-effects',
    title: '状态效果 status-effects',
    match: (f) => path.basename(f) === 'status-effects.toml',
    containerKey: 'status-effects',
    isArray: false,
    groupBy: (e) => e.category || '—',
    keyFields: (e) => {
      const bits = [`dur=${e.duration ?? '—'}`]
      bits.push(e.stackable ? `stack×${e.max_stack ?? '∞'}` : '不叠加')
      return bits.join(' · ')
    },
    container: (d) => d['status-effects'],
    template: `[status-effects."新状态"]
name = "新状态"
description = "…"
category = "buff"          # buff/debuff
duration = 120             # 0 = 永久
stackable = true
max_stack = 3
# 可选 tick_effects = [{ type = "modify_attribute", params = { attr = "hp", value = -5, target = "self" } }]`,
    note: `h-core/data/default/status-effects.toml ·
条件路径 character.{id}.status.{状态ID} / .stack；v1 不深挖 tick_effects 内部引用`,
  },

  // ═══ 物品 items（多文件合并） ═══
  {
    id: 'items',
    title: '物品 items',
    match: (f) => /[/\\]items([/\\]|\.toml$)/.test(f) && !/[/\\]instructions[/\\]/.test(f),
    containerKey: 'items',
    isArray: false,
    groupBy: (e) => e.type || e.tags?.[0] || '—',
    keyFields: (e) => {
      const bits = [`type=${e.type ?? '—'}`]
      bits.push(e.stackable ? '可堆叠' : '不堆叠')
      if (e.food_quality != null) bits.push(`食Q${e.food_quality}`)
      if (e.consume === false) bits.push('不消耗')
      if (e.use?.length) bits.push(`use[${e.use.join(',')}]`)
      return bits.join(' · ')
    },
    container: (d) => d.items,
    template: `[items."新物品"]
name = "新物品"
type = "consumable"        # consumable/tool/equipment/...
use = ["h_drug"]            # 或 ["food"] 等
tags = ["drug"]
stackable = true
consume = true
body_slot = -1
effects = [{ type = "apply_xxx", params = { ... } }]   # 效果 type 须已注册`,
    note: `h-core/items/（药物/玩具/特种）+ h-bondage + hunger-system + confinement-system，
分散多文件、跨文件按 ID 合并 → 跨文件重名会被查重；v1 不展开 effects 内部引用`,
  },

  // ═══ 束缚类型 bondage ═══
  {
    id: 'bondage',
    title: '束缚类型 bondage',
    match: (f) => /[/\\]bondage[/\\]types\.toml$/.test(f),
    containerKey: 'types',
    isArray: true,
    entryId: (key, e) => String(e.id),
    groupBy: (e) => `Lv${e.level}`,
    keyFields: (e) => `affect_walking=${e.affect_walking} · facility=${e.need_facility}`,
    container: (d) => d.types,
    template: `[[types]]
id = 16                  # 新 id 递增，勿撞已有
name = "新缚"
level = 1                # 影响挣脱难度档
affect_walking = false
need_facility = false
description = "…"`,
    note: `h-core/data/default/bondage/types.toml ·
数组表（[[types]]），完全对齐 erArk Bondage.csv`,
  },

  // ═══ 实绩 juels ═══
  {
    id: 'juels',
    title: '实绩 juels',
    match: (f) => path.basename(f) === 'juels.toml',
    containerKey: 'juels',
    isArray: false,
    groupBy: () => '—',
    keyFields: (e) => `→ ${e.status_attr ?? '—'}`,   // status_attr 引用属性 → 校验
    container: (d) => d.juels,
    template: `[juels."N"]
name = "新律珠"
status_attr = "应引用的 daily_reset 属性名"`,
    note: `h-core/data/default/juels.toml（生成文件，勿手改）·
status_attr 必须指向 attributes.toml 里存在的每日重置属性 → 校验`,
  },

  // ═══ 装备槽 equipment ═══
  {
    id: 'equipment',
    title: '装备槽 equipment',
    match: (f) => path.basename(f) === 'equipment.toml',
    containerKey: 'slots',
    isArray: true,
    entryId: (key, e) => String(e.id),
    groupBy: (e) => e.category || '—',
    keyFields: (e) => `removable=${e.removable} · semen=${e.semen_capacity ?? '—'}`,
    container: (d) => d.slots,
    template: `[[slots]]
id = "中衣"
name = "中衣"
category = "clothing"    # clothing/underwear/accessory
removable = true
semen_capacity = 4000`,
    note: 'h-core/data/default/equipment.toml · 数组表（[[slots]]）',
  },

  // ═══ 天赋获得规则 talent-gains ═══
  {
    id: 'talent-gains',
    title: '天赋获得规则 talent-gains',
    match: (f) => path.basename(f) === 'talent-gains.toml',
    containerKey: 'talents',
    isArray: false,
    groupBy: (e) => {
      const m = { 0: '随时', 1: '手动', 2: '指令绑定', 3: '睡觉' }
      return `type${e.gain?.gain_type ?? '?'}(${m[e.gain?.gain_type] ?? '?'})`
    },
    keyFields: (e) => {
      const needs = e.gain?.needs || []
      const cnt = {}
      for (const n of needs) cnt[n.type] = (cnt[n.type] || 0) + 1
      const bits = Object.entries(cnt).map(([t, n]) => `${t}×${n}`)
      if (e.gain?.replace) bits.push(`replace=${e.gain.replace}`)
      return bits.join(' · ')
    },
    container: (d) => d.talents,
    template: `[talents."已存在天赋名"]
gain = { gain_type = 3, needs = [
  { type = "ability", id = "亲密", value = 4 },
  { type = "talent", id = "思慕" },
  { type = "trust", value = 100 },
], replace = "思慕" }`,
    note: `h-core/data/default/talent-gains.toml（生成文件，勿手改）·
[talents."X"] 的 key 必须已定义于 talents.toml；
needs 的 ability→能力 / talent→天赋 / juel→实绩 都会被校验`,
  },
]

// ---------- 收集 ----------
const parseErrors = []
const collections = {} // id -> Map<entryId, {entry, src:Set<file>}>
const relationData = { types: new Map(), pairs: new Map(), groups: new Map() }

function collectObject(cat, data, file) {
  const container = cat.container(data)
  if (!container || typeof container !== 'object') return
  const map = collections[cat.id] || (collections[cat.id] = new Map())
  for (const key of Object.keys(container)) {
    const entry = container[key]
    const id = key
    if (map.has(id)) {
      map.get(id).src.add(file)
    } else {
      map.set(id, { entry, src: new Set([file]) })
    }
  }
}
function collectArray(cat, data, file) {
  const container = cat.container(data)
  if (!Array.isArray(container)) return
  const map = collections[cat.id] || (collections[cat.id] = new Map())
  container.forEach((entry, i) => {
    const id = cat.entryId ? cat.entryId(i, entry) : String(entry.id ?? entry.name ?? i)
    if (map.has(id)) map.get(id).src.add(file)
    else map.set(id, { entry, src: new Set([file]) })
  })
}

for (const file of allFiles) {
  let data
  try {
    data = TOML.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    parseErrors.push(`${shortPath(file)} — 解析失败: ${e.message.split('\n')[0]}`)
    continue
  }
  for (const cat of CATEGORIES) {
    if (cat.isRelation) {
      if (cat.match(file)) {
        for (const k of ['types', 'pairs', 'groups']) {
          const container = data[k]
          if (container && typeof container === 'object') {
            for (const key of Object.keys(container)) relationData[k].set(key, container[key])
          }
        }
      }
      continue
    }
    if (!cat.match(file)) continue
    if (cat.isArray) collectArray(cat, data, file)
    else collectObject(cat, data, file)
  }
}

// ---------- 引用集合 ----------
const idSet = (catId) => new Set([...(collections[catId] || new Map()).keys()])
const refSets = {
  talents: idSet('talents'),
  abilities: idSet('abilities'),
  attributes: idSet('attributes'),
  juels: idSet('juels'),
  relationTypes: new Set(relationData.types.keys()),
  relationPairs: new Set(relationData.pairs.keys()),
}

// ---------- 校验 ----------
const violations = [] // {severity, msg, file?, id?}
function vio(severity, msg, file, id) {
  violations.push({ severity, msg, file: file ? shortPath(file) : undefined, id })
}

// 1) 解析错误 / 跨文件重复
for (const msg of parseErrors) vio('error', msg)
for (const cat of CATEGORIES) {
  if (cat.isRelation) continue
  const map = collections[cat.id]
  if (!map) continue
  for (const [id, rec] of map) {
    if (rec.src.size > 1) {
      const files = [...rec.src].map(shortPath).join(', ')
      vio('error', `[${cat.title}] 重复 ID "${id}"：${files}`, [...rec.src][0], id)
    }
  }
}

// 2) 悬空引用
function checkNeeds(catLabel, ownerId, needs, allowTypes) {
  for (const n of needs || []) {
    if (n.type === 'ability' && !refSets.abilities.has(n.id)) {
      vio('error', `[${catLabel}] "${ownerId}" needs 引用未定义能力 "${n.id}"`, undefined, ownerId)
    }
    if (n.type === 'talent' && !refSets.talents.has(n.id)) {
      vio('error', `[${catLabel}] "${ownerId}" needs 引用未定义天赋 "${n.id}"`, undefined, ownerId)
    }
    if (n.type === 'juel' && !refSets.juels.has(String(n.id))) {
      vio('error', `[${catLabel}] "${ownerId}" needs 引用未定义实绩 "${n.id}"`, undefined, ownerId)
    }
  }
}

// talents 内嵌 gain
for (const [id, rec] of collections.talents || new Map()) {
  checkNeeds('天赋', id, rec.entry.gain?.needs)
}
// talent-gains
for (const [id, rec] of collections['talent-gains'] || new Map()) {
  const g = rec.entry.gain || {}
  if (!refSets.talents.has(id)) {
    vio('error', `[天赋获得规则] 目标天赋 "${id}" 未定义于 talents.toml`, undefined, id)
  }
  checkNeeds('天赋获得规则', id, g.needs)
  if (g.replace && !refSets.talents.has(g.replace)) {
    vio('error', `[天赋获得规则] "${id}" replace 指向未定义天赋 "${g.replace}"`, undefined, id)
  }
}
// ability-upgrades
for (const [id, rec] of collections['ability-upgrades'] || new Map()) {
  if (!refSets.abilities.has(id)) {
    vio('error', `[能力升级表] 目标能力 "${id}" 未定义于 abilities.toml`, undefined, id)
  }
  for (const up of rec.entry.upgrades || []) checkNeeds('能力升级表', id, up.needs)
}
// juels
for (const [id, rec] of collections.juels || new Map()) {
  const attr = rec.entry.status_attr
  if (attr && !refSets.attributes.has(attr)) {
    vio('error', `[实绩] "${id}" status_attr 引用未定义属性 "${attr}"`, undefined, id)
  }
}
// relations：types.pair / groups 成员
for (const [id, t] of relationData.types) {
  if (t.pair && !refSets.relationPairs.has(t.pair)) {
    vio('error', `[关系类型] "${id}" pair 引用未定义词表 "${t.pair}"`, undefined, id)
  }
}
for (const [gid, members] of relationData.groups) {
  for (const m of members || []) {
    if (typeof m === 'string') {
      if (!refSets.relationTypes.has(m) && !refSets.relationPairs.has(m)) {
        vio('error', `[关系组] "${gid}" 引用未定义关系类型 "${m}"`, undefined, gid)
      }
    } else if (m && m.pair && !refSets.relationPairs.has(m.pair)) {
      vio('error', `[关系组] "${gid}" 引用未定义词表 "${m.pair}"`, undefined, gid)
    }
  }
}

// ---------- 汇总/渲染 ----------
const totalEntries = CATEGORIES.filter((c) => c.id !== 'relations')
  .reduce((n, c) => n + (collections[c.id] ? collections[c.id].size : 0), 0)

function relTypeInfo() {
  const n = relationData.types.size
  const pairs = relationData.pairs.size
  const groups = relationData.groups.size
  return `types=${n} · pairs=${pairs} · groups=${groups}`
}

function mdTable(rows) {
  const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const head = '| ID | 分组 | 关键字段 | 来源 |\n|---|---|---|---|'
  const body = rows
    .map((r) => `| ${esc(r.id)} | ${esc(r.group)} | ${esc(r.kf)} | ${esc(r.src)} |`)
    .join('\n')
  return `${head}\n${body}`
}

function renderCategory(cat) {
  const map = collections[cat.id]
  if (!map || map.size === 0) return `> （无条目）\n`
  const out = []
  // 分组小计
  const groupCount = new Map()
  for (const rec of map.values()) {
    const g = cat.groupBy(rec.entry)
    groupCount.set(g, (groupCount.get(g) || 0) + 1)
  }
  out.push(`**${cat.title}（${map.size}）**`)
  out.push('')
  out.push(`分组小计：${[...groupCount.entries()].map(([g, n]) => `\`${g}\` ${n}`).join('　')}`)
  out.push('')
  const rows = [...map.entries()]
    .map(([id, rec]) => ({
      id,
      group: cat.groupBy(rec.entry),
      kf: cat.keyFields(rec.entry),
      src: [...rec.src].map(shortPath).sort().join(' + '),
    }))
    .sort((a, b) => a.group.localeCompare(b.group, 'zh') || a.id.localeCompare(b.id, 'zh'))
  out.push(mdTable(rows))
  return out.join('\n')
}

const md = []
md.push('# 原生词条速查表（Native Default Entries Catalog）')
md.push('')
md.push('> 自动生成：`npm run gen:catalog`（`scripts/gen-native-catalog.cjs`）。**勿手改**，改数据/新增词条后重新生成提交。')
md.push('> 扫描范围：`src/plugins/*/data/default/**/*.toml`（与引擎 mod-loader glob 一致）。**不含 mod 层**。')
md.push('> 校验：`npm run check:catalog`（`--check`），重复 ID / 悬空引用 → 退出码 1。')
md.push('')
md.push('## 汇总')
md.push('')
{
  const esc = (s) => String(s ?? '').replace(/\|/g, '\\|')
  md.push('| 类目 | 数量 | 说明 |')
  md.push('|---|---|---|')
  for (const cat of CATEGORIES) {
    if (cat.isRelation) {
      md.push(`| 关系 relations | ${relTypeInfo()} | ${esc(cat.note.replace(/\n/g, ' '))} |`)
    } else {
      const size = collections[cat.id] ? collections[cat.id].size : 0
      md.push(`| ${esc(cat.title)} | ${size} | ${esc(cat.note.replace(/\n/g, ' '))} |`)
    }
  }
  md.push(`| **合计** | **${totalEntries + relationData.types.size + relationData.pairs.size + relationData.groups.size}** | 含关系子表 |`)
  md.push('')
}

for (const cat of CATEGORIES) {
  md.push(`## ${cat.title}`)
  md.push('')
  md.push(`**添加新词条**（复制模板，改后重跑生成）：`)
  md.push('')
  md.push('```toml')
  md.push(cat.template)
  md.push('```')
  md.push('')
  md.push(`> 归属/注意：${cat.note}`)
  md.push('')
  if (cat.isRelation) {
    const sub = [
      ['types', '关系类型 types', (e) => {
        if (e.kind === 'relation' || e.pair || e.side || e.reverse) {
          const bits = [`kind=relation`]
          if (e.pair) bits.push(`pair=${e.pair}`)
          if (e.side) bits.push(`side=${e.side}`)
          if (e.reverse) bits.push(`reverse=${e.reverse}`)
          return bits.join(' · ')
        }
        return `kind=sentiment · [${e.min ?? 0},${e.max ?? 100}] · def=${e.default ?? '—'}`
      }],
      ['pairs', '称呼词表 pairs', (e) => {
        const bits = []
        const panel = e.panel
        bits.push(typeof panel === 'string' ? `panel=${panel}` : `panel=${Object.keys(panel || {}).length}词`)
        if (e.address) bits.push(typeof e.address === 'string' ? 'addr' : `addr=${Object.keys(e.address).length}端`)
        return bits.join(' · ')
      }],
      ['groups', '关系组 groups', (e, gid) => {
        const types = e.filter((m) => typeof m === 'string').length
        const pairs = e.filter((m) => m && typeof m === 'object').length
        return `成员=${e.length}（类型×${types} · pair×${pairs}）`
      }],
    ]
    for (const [key, label, kf] of sub) {
      const map = relationData[key]
      md.push(`### ${label}（${map.size}）`)
      md.push('')
      if (map.size === 0) {
        md.push('> （无条目）')
        md.push('')
        continue
      }
      const rows = [...map.entries()].map(([id, e]) => ({
        id,
        group: '—',
        kf: kf(e, id),
        src: 'h-core/relations.toml',
      }))
      md.push(mdTable(rows))
      md.push('')
    }
  } else {
    md.push(renderCategory(cat))
  }
  md.push('')
}

// 校验报告
md.push('## 校验报告')
md.push('')
if (parseErrors.length + violations.length === 0) {
  md.push('✅ **通过**：无解析错误、无重复 ID、无悬空引用。')
} else {
  md.push(`⚠️ **发现 ${parseErrors.length + violations.length} 处问题**（` +
    `解析错误 ${parseErrors.length} / 重复或引用问题 ${violations.length - parseErrors.length}）：`)
  md.push('')
  for (const v of violations) {
    const loc = v.file ? `（${v.file}${v.id ? ` → ${v.id}` : ''}）` : ''
    md.push(`- \`${v.severity}\` ${v.msg}${loc}`)
  }
}
md.push('')
md.push('## 如何新增一类词条')
md.push('')
md.push('所有类目由 `CATEGORIES` 注册表驱动（`scripts/gen-native-catalog.cjs`）。新增一类"能新加的简单词条"：')
md.push('')
md.push('```')
md.push('1) 在 CATEGORIES 数组末尾加一条：')
md.push('   { id:"新类目", title:"…", match:(f)=>path.basename(f)==="xx.toml",')
md.push('     containerKey:"xx容器", isArray:false,')
md.push('     groupBy:(e)=>"…", keyFields:(e)=>"…",')
md.push('     container:(d)=>d.xx, template:"添加模板TOML", note:"归属/注意" }')
md.push('   （数组型词条：isArray:true + entryId —— 参考 equipment/bondage）')
md.push('2) 必要时在"校验"段补 refs 规则（参考 talent-gains / juels）')
md.push('3) 重跑 npm run gen:catalog，确认新表与计数')
md.push('```')
md.push('')

const body = md.join('\n')
if (checkOnly) {
  if (parseErrors.length + violations.length > 0) {
    process.stdout.write(body)
    console.error(`\n[gen-native-catalog] 校验未通过：${parseErrors.length + violations.length} 处（解析错误 ${parseErrors.length} / 重复或引用问题 ${violations.length - parseErrors.length}）`)
    process.exit(1)
  }
  console.log(`[gen-native-catalog] ✅ 校验通过：解析 ${allFiles.length} 个 TOML，词条 ${totalEntries}（关系子表 ${relationData.types.size + relationData.pairs.size + relationData.groups.size}）。`)
} else {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, body, 'utf8')
  if (parseErrors.length + violations.length > 0) {
    console.error(`[gen-native-catalog] 已生成 ${rel(reportPath)}，但校验未通过：${parseErrors.length + violations.length} 处。`)
    console.error(body.split('\n').filter((l) => l.startsWith('- `')).join('\n'))
    process.exit(1)
  }
  console.log(`[gen-native-catalog] ✅ 已生成 ${rel(reportPath)}（词条 ${totalEntries}，关系子表 ${relationData.types.size + relationData.pairs.size + relationData.groups.size}）。`)
}
