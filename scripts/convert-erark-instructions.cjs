/**
 * erArk 指令转换脚本
 * 读取 erArk CSV → 精确映射效果 ID → 生成 TOML 指令文件
 *
 * 用法: node scripts/convert-erark-instructions.js
 */

const fs = require('fs')
const path = require('path')

const ERA_DIR = '用来复刻的蓝本游戏 erArk 不要commit/data/csv'
const OUT_DIR = 'mods/test-mod/definitions/h-instructions'

// ===== 效果 ID → 我们的 effect type + params 映射 =====
const EFFECT_MAP = {
  // 基础属性 (0-99)
  11: { type: 'modify_attribute', params: { attr: '体力', value: -10 } },
  12: { type: 'modify_attribute', params: { attr: '气力', value: -10 } },
  13: { type: 'modify_attribute', params: { attr: '体力', value: -25 } },
  14: { type: 'modify_attribute', params: { attr: '气力', value: -25 } },
  15: { type: 'modify_attribute', params: { attr: '体力', value: -50 } },
  16: { type: 'modify_attribute', params: { attr: '气力', value: -50 } },
  21: { type: 'settle_favorability', params: {} },
  22: { type: 'settle_trust', params: {} },
  23: { type: 'settle_trust', params: { base: 2 } },
  31: { type: 'modify_attribute', params: { attr: '体力', value: -50, target: 'self' } },
  36: { type: 'modify_attribute', params: { attr: '气力', value: -50, target: 'self' } },
  38: { type: 'modify_attribute', params: { attr: '尿意', value: 5 } },
  39: { type: 'modify_attribute', params: { attr: '尿意', value: 5 } },

  // 状态值 (50-99) → settle_state，baseValue 各不同
  // 注意: 51-70 大部分是 TARGET_* 效果，用 settle_state 默认 target
  49: { type: 'settle_state', params: { state: '欲情', baseValue: 30 } },
  51: { type: 'settle_state', params: { state: '快乐', baseValue: 30 } },
  52: { type: 'settle_state', params: { state: '恭顺', baseValue: 30 } },
  53: { type: 'settle_state', params: { state: '好意', baseValue: 30 } },
  54: { type: 'settle_state', params: { state: '羞耻', baseValue: 30 } },
  55: { type: 'settle_state', params: { state: '屈服', baseValue: 30 } },
  58: { type: 'settle_state', params: { state: '润滑', baseValue: 30 } },
  62: { type: 'settle_state', params: { state: '苦痛', baseValue: 30 } },
  70: { type: 'settle_state', params: { state: '恐怖', baseValue: 30 } },
  81: { type: 'settle_state', params: { state: '习得', baseValue: 30 } },

  // H 中消耗 (1515, 1516) — 大的体力/气力消耗
  1515: { type: 'modify_attribute', params: { attr: '体力', value: -30 } },
  1516: { type: 'modify_attribute', params: { attr: '气力', value: -30 } },
  1511: { type: 'modify_attribute', params: { attr: '体力', value: -15, target: 'self' } },
  1512: { type: 'modify_attribute', params: { attr: '气力', value: -15, target: 'self' } },

  // CVE 前缀 — 通过 condition 字段处理
  // 格式: CVE_A1_E|{id}_G_{threshold} → condition = "player.experience.{id} >= {threshold}"
  // 格式: CVE_A2_E|{id}_G_{threshold} → condition = "target.experience.{id} >= {threshold}"
}

// ===== 状态 ID → 中文名映射（erArk status_data）=====
const STATE_NAMES = {
  0: '皮肤', 1: '胸部', 2: '阴蒂', 3: '阴茎', 4: '阴道', 5: '肛肠',
  6: '尿道', 7: '子宫', 8: '润滑', 9: '习得', 10: '恭顺', 11: '好意',
  12: '欲情', 13: '快乐', 14: '先导', 15: '屈服', 16: '羞耻', 17: '苦痛',
  18: '恐怖', 19: '抑郁', 20: '反感', 21: '口喉', 22: '兽部', 23: '心理',
}

// ===== 跳过的行为 ID 列表 =====
const SKIP_BEHAVIORS = new Set([
  'share_blankly', 'change_cloth', 'chara_diy_instruct', 'ai_chat_instruct',
  'test_instruct', 'empty_instruct', 'chat_failed', 'apologize_failed',
  'simple_shower', 'get_up',
  // 监禁相关
  'put_into_prison', 'set_free', 'bagging_and_moving', 'release_from_bag',
  'train_prisoner', 'manage_confinement_and_training',
  // 源石技艺
  'penetrating_vision_on', 'penetrating_vision_off', 'hormone_on', 'hormone_off',
  // 香薰
  'aromatherapy',
  // 未实装
  'battle_command', 'collcet_panty', 'ask_date', 'drink_alcohol',
  'target_free_in_time_stop', 'target_stop_in_time_stop',
  'sedecu', 'shame_play', 'take_shower_h', 'bubble_bath', 'give_blowjob',
  'double_penetration', 'beat_breast', 'needle',
  // 已废弃
  'enemas', 'womb_insertion', 'womb_sex', 'anal_plug',
  // 特殊（已在子系统中管理）
  'hidden_sex_end', 'exhibitionism_sex_end', 'group_sex_end',
  'imprisonment_h_end', 'unconscious_h_end', 'h_with_daughter_end',
  'do_h_with_daughter', 'imprisonment_h',
])

// ===== 跳过 TO_DO 的指令 =====
function shouldSkip(instruct) {
  if (SKIP_BEHAVIORS.has(instruct.behavior_id)) return true
  if (instruct.premises && instruct.premises.includes('TO_DO')) return true
  return false
}

// ===== CSV 解析器（简单版，处理 erArk CSV 格式）=====
function parseCSV(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8')
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  // 跳过前 5 行 (header + desc + type + default + section)
  const dataLines = lines.slice(5)
  const headers = lines[0].split(',')
  const result = []
  for (const line of dataLines) {
    if (!line.trim() || line.startsWith('--')) continue
    // 简单 CSV 解析（不支持引号内逗号，但 erArk CSV 基本没有）
    const fields = line.split(',')
    if (fields.length < 3) continue
    const row = {}
    headers.forEach((h, i) => { row[h.trim()] = (fields[i] || '').trim() })
    result.push(row)
  }
  return result
}

// ===== 解析效果链字符串 =====
function parseEffectChain(str) {
  if (!str || str === '9999' || str === '0') return []
  return str.split('-').map(s => s.trim()).filter(s => s)
}

// ===== 翻译一个效果 ID → 我们的 effect 对象 =====
function translateEffect(effId, prevEff) {
  effId = effId.trim()

  // CVE 复合效果
  const cveMatch = effId.match(/^CVE_A(\d)_E\|(\d+)_G_(\d+)$/)
  if (cveMatch) {
    const who = cveMatch[1] === '1' ? 'player' : 'target'
    const expId = cveMatch[2]
    const threshold = parseInt(cveMatch[3])
    // CVE 本身不产生独立效果，是条件修饰符
    // 返回一个 "condition" 对象，由调用方附加到前一个效果
    return { _cve: true, condition: `${who}.experience.${expId} >= ${threshold}` }
  }

  // 数字效果 ID
  const numId = parseInt(effId)
  if (isNaN(numId)) {
    // 未知效果，返回注释
    return { type: '_unknown', params: { erArkId: effId } }
  }

  const mapped = EFFECT_MAP[numId]
  if (mapped) return { ...mapped, params: { ...mapped.params } }

  // 100+ 用于部位快感（100-199 = 各部位快感 +50 baseValue）
  if (numId >= 100 && numId < 200) {
    // Body feel effects with state ID lookup
    const feelMap = {
      101: '快乐', 111: '皮肤', 154: '胸部', 155: '阴蒂',
      159: '阴道', 161: '肛肠', 163: '尿道', 165: '子宫',
      171: '口喉',
    }
    const state = feelMap[numId]
    if (state) return { type: 'settle_state', params: { state, baseValue: 50 } }
  }

  // 服饰效果 (600-649)
  if (numId >= 600 && numId < 650) {
    // 已经有 cloth_remove/cloth_wear 等 effect type
    const clothMap = {
      601: { type: 'cloth_set_visible', params: { part: '内衣', visible: true } },
      603: { type: 'cloth_set_visible', params: { part: '胸罩', visible: true } },
      605: { type: 'cloth_set_visible', params: { part: '内裤', visible: true } },
      631: { type: 'cloth_wear_all', params: {} },
      632: { type: 'cloth_remove_all', params: {} },
    }
    if (clothMap[numId]) return { ...clothMap[numId], params: { ...clothMap[numId].params } }
  }

  // H 特殊效果 (400-530)
  if (numId === 404) return { type: 'h_end_h', params: {} }
  if (numId === 405) return { type: 'set_field', params: { path: 'h_state.orgasm_level_sync', value: true } }
  if (numId === 406) return { type: 'set_field', params: { path: 'h_state.is_h', value: true } }
  if (numId === 407) return { type: 'set_field', params: { path: 'h_state.is_h', value: false } }
  if (numId === 461) return { type: 'set_field', params: { path: 'h_state.npc_active_h', value: true } }
  if (numId === 462) return { type: 'set_field', params: { path: 'h_state.npc_active_h', value: false } }
  if (numId === 463) return { type: 'set_field', params: { path: 'h_state.npc_active_h', value: true } }
  if (numId === 464) return { type: 'set_field', params: { path: 'h_state.npc_active_h', value: false } }
  if (numId === 526) return { type: 'set_field', params: { path: 'h_state.orgasm_edge', value: 2 } }
  if (numId === 528) return { type: 'group_sex_end_add_hpmp_max', params: {} }
  if (numId === 529) return { type: 'group_sex_end_add_hpmp_max', params: {} }
  if (numId === 530) return { type: 'group_sex_fail_add_just', params: {} }
  if (numId === 535) return { type: 'train_prisoners_add_adjust', params: {} }

  // 首次相关 (1101-1109)
  if (numId === 1101) return { type: 'set_field', params: { path: 'sp_flag.first_kiss', value: true } }
  if (numId === 1103) return { type: 'set_field', params: { path: 'sp_flag.first_sex', value: true } }

  // 时停效果
  if (numId === 1241) return { type: 'time_stop_on', params: {} }
  if (numId === 1242) return { type: 'time_stop_off', params: {} }

  // 群交模式
  if (numId === 10010) return { type: 'group_sex_mode_on', params: {} }
  if (numId === 10011) return { type: 'group_sex_mode_off', params: {} }

  // 催眠效果
  if (numId >= 1211 && numId <= 1231) {
    const hypoMap = {
      1211: 'hypnosis_one', 1212: 'hypnosis_all', 1213: 'hypnosis_cancel',
      1221: 'hypnosis_increase_body_sensitivity_on',
      1222: 'hypnosis_increase_body_sensitivity_off',
      1223: 'hypnosis_force_climax',
      1224: 'hypnosis_force_ovulation_on',
      1225: 'hypnosis_force_ovulation_off',
      1226: 'hypnosis_blockhead_switch',
      1227: 'hypnosis_blockhead_off',
      1228: 'hypnosis_active_h_switch',
      1229: 'hypnosis_active_h_off',
      1230: 'hypnosis_pain_as_pleasure_switch',
      1231: 'hypnosis_pain_as_pleasure_off',
    }
    if (hypoMap[numId]) return { type: hypoMap[numId], params: {} }
  }

  // 日常特殊效果
  if (numId === 304) return { type: 'set_field', params: { path: 'sp_flag.showering', value: true } }
  if (numId === 325) return { type: 'modify_attribute', params: { attr: '疲劳', value: -10 } }
  if (numId === 341) return { type: 'set_field', params: { path: 'sp_flag.apologized', value: true } }
  if (numId === 363) return { type: 'set_field', params: { path: 'sp_flag.following', value: true } }
  if (numId === 365) return { type: 'set_field', params: { path: 'sp_flag.following', value: false } }
  if (numId === 366) return { type: 'set_field', params: { path: 'sp_flag.woke_up', value: true } }
  if (numId === 372) return { type: 'set_field', params: { path: 'sp_flag.sleeping', value: false } }
  if (numId === 457) return { type: 'modify_attribute', params: { attr: '睡意', value: -50 } }
  if (numId === 489) return { type: 'modify_attribute', params: { attr: '疲劳', value: -30 } }
  if (numId === 509) return { type: 'modify_attribute', params: { attr: '欲望', value: -20 } }
  if (numId === 525) return { type: 'set_field', params: { path: 'sp_flag.clean', value: true } }
  if (numId === 538) return { type: 'modify_relation', params: { relation: '好感度', value: 10 } }
  if (numId === 606) return { type: 'set_field', params: { path: 'sp_flag.pajamas', value: true } }
  if (numId === 634) return { type: 'set_field', params: { path: 'sp_flag.night_clothes', value: true } }
  if (numId === 648) return { type: 'cloth_wear_all', params: {} }
  if (numId === 649) return { type: 'cloth_remove_all', params: {} }
  if (numId === 702) return { type: 'modify_attribute', params: { attr: '尿意', value: -50 } }
  if (numId === 703) return { type: 'modify_attribute', params: { attr: '饥饿', value: -30 } }
  if (numId === 751) return { type: 'set_field', params: { path: 'sp_flag.moved', value: true } }
  if (numId === 931) return { type: 'modify_attribute', params: { attr: '欲望', value: -30 } }
  if (numId === 932) return { type: 'modify_attribute', params: { attr: '欲望', value: -50 } }
  if (numId === 1504) return { type: 'modify_attribute', params: { attr: '体力', value: 50, target: 'self' } }
  if (numId === 1505) return { type: 'modify_attribute', params: { attr: '气力', value: 50, target: 'self' } }
  if (numId === 1751) return { type: 'set_field', params: { path: 'sp_flag.urinated', value: true } }

  // 经验/计数效果 (500-599)
  if (numId >= 500 && numId < 600) {
    const expMap = {
      501: { type: 'add_experience', params: { id: 'social', value: 1 } },
      502: { type: 'add_experience', params: { id: 'domestic', value: 1 } },
      506: { type: 'set_field', params: { path: 'sp_flag.office_work_done', value: true } },
    }
    if (expMap[numId]) return { ...expMap[numId], params: { ...expMap[numId].params } }
  }

  // 未知效果 → 注释占位
  return { type: '_unknown', params: { erArkId: effId } }
}

// ===== 主流程 =====
function main() {
  const eraPath = path.join(process.cwd(), ERA_DIR)
  const outPath = path.join(process.cwd(), OUT_DIR)

  // 读取 erArk CSV 数据
  const instructData = parseCSV(path.join(eraPath, 'InstructConfig.csv'))
  const effectData = parseCSV(path.join(eraPath, 'Behavior_Effect.csv'))
  const behaviorData = parseCSV(path.join(eraPath, 'Behavior_Data.csv'))

  // 构建 effect 链查询表: behavior_id → effect_string
  // 注意: erArk CSV 中大小写不一致，统一转大写查找
  const effectMap = {}
  for (const row of effectData) {
    effectMap[row.behavior_id.toUpperCase()] = row.effect_id
  }

  // 构建 duration 查询表: behavior_id → duration
  const durationMap = {}
  for (const row of behaviorData) {
    durationMap[row.en_name.toUpperCase()] = parseInt(row.duration)
  }

  // 按 instruct_type 分组
  const groups = {
    daily: [], play: [], work: [], arts: [], obscenity: [], sex: [],
  }

  for (const inst of instructData) {
    const id = inst.instruct_id; const name = inst.name; const type = inst.instruct_type
    const subType = inst.instruct_sub_type; const premiseStr = inst.premise_set
    const behaviorId = inst.behavior_id
    const bodyParts = inst.body_parts

    // 映射 type
    let ourType = null
    if (type === '1' || type === 'DAILY') ourType = 'daily'
    else if (type === '2' || type === 'PLAY') ourType = 'play'
    else if (type === '3' || type === 'WORK') ourType = 'work'
    else if (type === '4' || type === 'ARTS') ourType = 'arts'
    else if (type === '5' || type === 'OBSCENITY') ourType = 'obscenity'
    else if (type === '6' || type === 'SEX') ourType = 'sex'
    else if (type === '0' || type === 'SYSTEM') ourType = 'system'

    if (!ourType || ourType === 'system') continue

    // 跳过不应做的
    if (shouldSkip({ behavior_id: behaviorId, premises: premiseStr })) continue
    // 跳过直接引用的子系统指令
    if (['hidden_sex_end', 'exhibitionism_sex_end', 'group_sex_end',
         'h_with_daughter_end', 'imprisonment_h_end', 'unconscious_h_end',
         'imprisonment_h', 'do_h_with_daughter',
        ].includes(behaviorId)) continue

    // 解析前提
    const premises = premiseStr ? premiseStr.split('|').filter(p => p && p !== '0') : []

    // 获取效果链（统一转大写查找）
    const effectStr = effectMap[(behaviorId || '').toUpperCase()] || ''
    const erArkEffectIds = parseEffectChain(effectStr)

    // 翻译效果——CVE 处理: CVE 是"条件满足时添加额外效果"
    // 我们的架构: CVE 作为 condition 附加到下一个非 CVE 效果
    // 若 CVE_A1 与 CVE_A2 连续，合并为 && 条件
    const effects = []
    const pendingConds = []
    for (const effId of erArkEffectIds) {
      const translated = translateEffect(effId)
      if (translated._cve) {
        pendingConds.push(translated.condition)
        continue
      }
      const eff = { type: translated.type, params: { ...translated.params } }
      if (pendingConds.length > 0) {
        eff.condition = pendingConds.length === 1 ? pendingConds[0] : pendingConds.join(' && ')
        pendingConds.length = 0
      }
      effects.push(eff)
    }

    // 获取耗时（统一转大写查找）
    const dur = durationMap[(behaviorId || '').toUpperCase()] || 10

    groups[ourType].push({
      id, name, type: ourType, subType, premises, effects, time_cost: dur, behaviorId,
    })
  }

  // 输出 TOML 文件
  if (!fs.existsSync(outPath)) fs.mkdirSync(outPath, { recursive: true })

  for (const [type, instructions] of Object.entries(groups)) {
    if (instructions.length === 0) continue
    let toml = '# 自动生成—请勿手动编辑\n'
    toml += `# 来源: erArk InstructConfig.csv + Behavior_Effect.csv\n`
    toml += `# 指令数: ${instructions.length}\n\n`

    for (const inst of instructions) {
      toml += `[[instructions]]\n`
      toml += `id = "${inst.id}"\n`
      toml += `label = "${inst.name}"\n`
      toml += `type = "${inst.type}"\n`
      if (inst.subType && inst.subType !== '0') {
        toml += `sub_type = "${inst.subType}"\n`
      }
      toml += `time_cost = ${inst.time_cost}\n`
      toml += `priority = 50\n`
      toml += `# erArk behavior: ${inst.behaviorId}\n`

      if (inst.premises.length > 0) {
        toml += `premises = [${inst.premises.map(p => `"${p}"`).join(', ')}]\n`
      } else {
        toml += `premises = []\n`
      }

      if (inst.effects.length > 0) {
        toml += `effects = [\n`
        for (const eff of inst.effects) {
          let line = `  { type = "${eff.type}"`
          const p = eff.params
          if (Object.keys(p).length > 0) {
            const paramStr = Object.entries(p)
              .map(([k, v]) => {
                if (typeof v === 'string') return `${k} = "${v}"`
                return `${k} = ${v}`
              }).join(', ')
            line += `, params = { ${paramStr} }`
          }
          if (eff.condition) {
            line += `, condition = "${eff.condition}"`
          }
          line += ' },\n'
          toml += line
        }
        toml += ']\n'
      } else {
        toml += `effects = []\n`
      }
      toml += '\n'
    }

    const filePath = path.join(outPath, `${type}.toml`)
    fs.writeFileSync(filePath, toml, 'utf-8')
    console.log(`✓ ${filePath}: ${instructions.length} 指令`)
  }

  console.log('\n完成!')
}

main()
