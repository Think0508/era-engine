// 注释：erArk 成长数据转换脚本——Juel.csv / AbilityUp.csv / TalentGain.csv → h-core 默认层 TOML
// 用法：node scripts/convert-erark-growth.cjs
// 输入：复刻攻略-猥亵-H系统专用/src/data/csv/ 下四个 CSV（含 Ability.csv 名称映射）
// 输出：src/plugins/h-core/data/default/ 下 juels.toml / ability-upgrades.toml / talent-gains.toml
// 生成结果提交入库；脚本本身可重复运行（幂等覆盖）

const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '..', '复刻攻略-猥亵-H系统专用', 'src', 'data', 'csv')
const OUT = path.join(__dirname, '..', 'src', 'plugins', 'h-core', 'data', 'default')

// ═══ CSV 解析（erArk 格式：4 行元数据 + 空行 + 表名行 + 数据行）═══
function parseCsv(file) {
  const raw = fs.readFileSync(path.join(SRC, file), 'utf8').replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '')
  // 元数据 4 行 + 表名行 1 行
  const dataLines = lines.slice(5)
  return dataLines.map(l => {
    // 简单 CSV 切分（数据不含引号内逗号）
    return l.split(',').map(s => s.trim())
  })
}

// ═══ 能力 id → 本引擎能力名（Ability.csv + 感度表；砍除项不映射）═══
// erArk ability 0-7 感度（6 尿道感度已砍——ADR-0004 不定义）、9-12 扩张（11 尿道扩张砍）、
// 13-19 刻印（无 AbilityUp 数据）、30-36 基础、40 话术（41-49 有意删减）、70-77+90 性技、
// 100 口喉/101 兽部(砍)/102 心理
const SENSATION = ['皮肤感度', '胸部感度', '阴蒂感度', '阴茎感度', '阴道感度', '后穴感度', null, '子宫感度'] // 6=尿道感度（dropped，ADR-0004）
const DILATION = { 9: '阴道扩张', 10: '后穴扩张', 12: '子宫扩张' } // 11 尿道扩张砍

function buildAbilityNameMap() {
  const map = {}
  for (const row of parseCsv('Ability.csv')) {
    const id = Number(row[0])
    if (Number.isNaN(id)) continue
    const name = row[2]
    if (!name) continue
    map[id] = name
  }
  for (let i = 0; i <= 7; i++) if (SENSATION[i]) map[i] = SENSATION[i]
  map[9] = DILATION[9]
  map[10] = DILATION[10]
  map[12] = DILATION[12]
  // 有意删减能力（对账表 dropped）：尿道感度/尿道扩张（ADR-0004）、技能系列 41-49（L2.13）、
  // 兽部感度（兽部全砍）——升级数据一并丢弃
  for (const id of [6, 11, 41, 42, 43, 44, 45, 46, 47, 48, 49, 101]) delete map[id]
  return map
}

// ═══ 素质 id → 名称（Talent.csv）═══
function buildTalentNameMap() {
  const map = {}
  for (const row of parseCsv('Talent.csv')) {
    const id = Number(row[0])
    if (Number.isNaN(id)) continue
    const name = row[2]
    if (!name) continue
    map[id] = name
  }
  return map
}

// ═══ need 字符串 → 语义化对象（"X<id>|<value>"，& 分隔）═══
// A=能力等级 T=素质存在 J=宝珠 E=经验 F=好感 X=信赖；"无"=空
function parseNeeds(str, abilityNames, talentNames, context) {
  if (!str || str === '无') return []
  const out = []
  for (const part of str.split('&')) {
    const [typeId, valueStr] = part.split('|')
    const type = typeId[0]
    const idRaw = typeId.slice(1)
    const value = Number(valueStr)
    switch (type) {
      case 'A': {
        const abilityId = Number(idRaw)
        const name = abilityNames[abilityId]
        if (!name) {
          console.warn(`[convert] ${context}：A${abilityId} 能力未映射（可能已砍），跳过该需求`)
          continue
        }
        out.push({ type: 'ability', id: name, value })
        break
      }
      case 'T': {
        const name = talentNames[value]
        if (!name) {
          console.warn(`[convert] ${context}：T${value} 素质未映射，跳过该需求`)
          continue
        }
        out.push({ type: 'talent', id: name })
        break
      }
      case 'J':
        out.push({ type: 'juel', id: Number(idRaw), value })
        break
      case 'E':
        out.push({ type: 'experience', id: Number(idRaw), value })
        break
      case 'F':
        out.push({ type: 'favorability', value })
        break
      case 'X':
        out.push({ type: 'trust', value })
        break
      default:
        console.warn(`[convert] ${context}：未知 need 类型 ${type}（${part}）`)
    }
  }
  return out
}

// ═══ 1. juels.toml（宝珠定义 + status 属性名映射）═══
// status 属性名 = 珠名去后缀（皮肤快感珠→皮肤），再经 erarkToOurs 归一（肛肠→后穴）
// 兽部快感珠（id 22）：兽部全砍（对账表 dropped）——不产出定义（存档残留 id 直通无读取方，无害）
const ERARK_TO_OURS = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'erark-name-map.json'), 'utf8')).erarkToOurs || {}
  } catch {
    return {}
  }
})()

const DROPPED_JUELS = new Set([22]) // 兽部快感珠（兽部全砍）

function genJuels() {
  const rows = parseCsv('Juel.csv').filter(r => !Number.isNaN(Number(r[0])))
  const lines = ['# 生成文件（scripts/convert-erark-growth.cjs）——勿手改', '# 宝珠定义（erArk Juel.csv id 直通）。status_attr：睡眠转珠时该宝珠对应哪个 daily_reset 参数属性', '# 注：兽部快感珠(22) 兽部全砍不产出；尿道快感珠(6) 保留（尿道 status 属性 display=false，ADR-0004）', '[juels]']
  for (const [id, name] of rows) {
    if (DROPPED_JUELS.has(Number(id))) continue
    let statusAttr = name.replace(/快感珠$/, '').replace(/珠$/, '')
    statusAttr = ERARK_TO_OURS[statusAttr] || statusAttr
    // 宝珠显示名同样归一（肛肠快感珠 → 后穴快感珠——本引擎命名，对账表 erarkToOurs）
    const suffix = name.endsWith('快感珠') ? '快感珠' : '珠'
    const stem = name.slice(0, -suffix.length)
    const displayName = (ERARK_TO_OURS[stem] || stem) + suffix
    lines.push(`\n[juels."${id}"]`)
    lines.push(`name = "${displayName}"`)
    lines.push(`status_attr = "${statusAttr}"`)
  }
  return lines.join('\n') + '\n'
}

// ═══ 2. ability-upgrades.toml（condition 模式升级路径 + 性别限定）═══
function genAbilityUpgrades() {
  const abilityNames = buildAbilityNameMap()
  // ability_id → sex_need（Ability.csv 第 4 列；缺省 -1 通用）
  const abilitySexNeed = {}
  for (const row of parseCsv('Ability.csv')) {
    const id = Number(row[0])
    if (Number.isNaN(id)) continue
    const sex = Number(row[3])
    if (!Number.isNaN(sex)) abilitySexNeed[id] = sex
  }
  const rows = parseCsv('AbilityUp.csv')
  // ability_id → { now_level: [upNeed, upNeed2] }
  const byAbility = {}
  for (const row of rows) {
    const abilityId = Number(row[1])
    const level = Number(row[2])
    if (Number.isNaN(abilityId) || Number.isNaN(level)) continue
    const name = abilityNames[abilityId]
    if (!name) {
      // 已砍能力（41-49/11/101 等）——升级数据一并丢弃（数据零消费）
      continue
    }
    if (!byAbility[name]) byAbility[name] = { id: abilityId, entries: [] }
    const upNeed = parseNeeds(row[3], abilityNames, {}, `${name} Lv${level}`)
    const upNeed2 = parseNeeds(row[4], abilityNames, {}, `${name} Lv${level} 备选`)
    byAbility[name].entries.push({ level, needs: upNeed, backup: upNeed2 })
  }
  const lines = ['# 生成文件（scripts/convert-erark-growth.cjs）——勿手改', '# 条件驱动升级路径（erArk AbilityUp.csv 复刻）：mode="condition" 的能力在结算点', '# （睡眠/H结束）按 upgrades 逐级检查 needs（满足任一：主 needs 或 backup_needs）', '# sex_need：erArk 原值（-1=通用 0=男限定 1=女限定）', '# extra_needs：能力级附加判定（erArk handle_ability.py extra_ability_check 硬编码数据化）——', '#   技巧：性技(technique tag)等级之和 ≥ 当前等级×per_level（玩家）/×per_level_npc', '#   顺从/欲望/受虐：升 4/6/8 级需对应刻印 1/2/3（已并入对应升级条目的 needs）']
  // erArk extra_ability_check 硬编码：顺从/欲望/受虐 在升 4/6/8 级（now_level 3/5/7）时需刻印 1/2/3
  const MARK_GATE = {
    顺从: { id: 11, name: '屈服刻印' },   // erArk ability 14
    欲望: { id: 12, name: '快乐刻印' },   // erArk ability 13
    受虐: { id: 13, name: '苦痛刻印' },   // erArk ability 15
  }
  for (const [name, data] of Object.entries(byAbility)) {
    data.entries.sort((a, b) => a.level - b.level)
    lines.push(`\n[abilities."${name}"]`)
    lines.push('mode = "condition"')
    // erArk sex_need 从 Ability.csv 读取（0/1/-1，缺省 -1）
    lines.push(`sex_need = ${abilitySexNeed[data.id] ?? -1}`)
    // 技巧：每级附加性技和判定（handle_ability.py:136-163——玩家 ×2 / NPC ×3）
    if (name === '技巧') {
      lines.push('extra_needs = [{ type = "ability_sum", tag = "technique", per_level = 2, per_level_npc = 3 }]')
    }
    for (const e of data.entries) {
      // 顺从/欲望/受虐：升 4/6/8 级（now_level 3/5/7）并入刻印门槛（handle_ability.py:164-235）
      const gate = MARK_GATE[name] && (e.level === 3 || e.level === 5 || e.level === 7)
      const needs = gate
        ? [{ type: 'ability', id: MARK_GATE[name].name, value: (e.level - 1) / 2 }, ...e.needs]
        : e.needs
      const needsToml = needs.length
        ? 'needs = [' + needs.map(n => tomlNeed(n)).join(', ') + ']'
        : 'needs = []'
      lines.push(`[[abilities."${name}".upgrades]]`)
      lines.push(needsToml)
      if (e.backup.length) {
        lines.push('backup_needs = [' + e.backup.map(n => tomlNeed(n)).join(', ') + ']')
      }
    }
  }
  return lines.join('\n') + '\n'
}

function tomlNeed(n) {
  if (n.type === 'ability') return `{ type = "ability", id = "${n.id}", value = ${n.value} }`
  if (n.type === 'talent') return `{ type = "talent", id = "${n.id}" }`
  if (n.type === 'favorability') return `{ type = "favorability", value = ${n.value} }`
  if (n.type === 'trust') return `{ type = "trust", value = ${n.value} }`
  return `{ type = "${n.type}", id = ${n.id}, value = ${n.value} }`
}

// ═══ 3. talent-gains.toml（素质获得：gain_type + 条件）═══
function genTalentGains() {
  const abilityNames = buildAbilityNameMap()
  const talentNames = buildTalentNameMap()
  const rows = parseCsv('TalentGain.csv')
  const lines = ['# 生成文件（scripts/convert-erark-growth.cjs）——勿手改', '# 素质获得定义（erArk TalentGain.csv 复刻）：gain_type 0=随时 1=手动 2=指令绑定 3=睡觉', '# 注意：erArk gain_type=2 无调用方（死代码，告白/戴上项圈指令效果链直接给素质），机制不实现', '[talents]']
  for (const row of rows) {
    const talentId = Number(row[1])
    const gainType = Number(row[3])
    const replaceId = Number(row[5])
    if (Number.isNaN(talentId)) continue
    const name = talentNames[talentId]
    if (!name) continue
    const needs = parseNeeds(row[4], abilityNames, talentNames, `${name} gain`)
    const linesFor = [`\n[talents."${name}"]`]
    const gainParts = [`gain_type = ${gainType}`]
    if (needs.length) gainParts.push('needs = [' + needs.map(n => tomlNeed(n)).join(', ') + ']')
    if (!Number.isNaN(replaceId) && replaceId > 0 && talentNames[replaceId]) {
      gainParts.push(`replace = "${talentNames[replaceId]}"`)
    }
    linesFor.push(`gain = { ${gainParts.join(', ')} }`)
    lines.push(...linesFor)
  }
  return lines.join('\n') + '\n'
}

// ═══ 写文件 ═══
fs.writeFileSync(path.join(OUT, 'juels.toml'), genJuels(), 'utf8')
fs.writeFileSync(path.join(OUT, 'ability-upgrades.toml'), genAbilityUpgrades(), 'utf8')
fs.writeFileSync(path.join(OUT, 'talent-gains.toml'), genTalentGains(), 'utf8')
console.log('done: juels.toml / ability-upgrades.toml / talent-gains.toml ->', OUT)
