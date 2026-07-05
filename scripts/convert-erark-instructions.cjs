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
  2: { type: 'modify_attribute', params: { attr: '体力', value: 15 } },
  3: { type: 'modify_attribute', params: { attr: '气力', value: 25 } },
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
  32: { type: 'set_field', params: { path: 'sp_flag.urinate', value: 0 } },
  33: { type: 'set_field', params: { path: 'target.sp_flag.urinate', value: 0 } },
  34: { type: 'set_field', params: { path: 'sp_flag.hunger', value: 0 } },
  36: { type: 'modify_attribute', params: { attr: '气力', value: -50, target: 'self' } },
  38: { type: 'modify_attribute', params: { attr: '尿意', value: 5 } },
  39: { type: 'modify_attribute', params: { attr: '尿意', value: 5 } },

  // 状态值 (50-99) → settle_state，baseValue 各不同
  // 注意: 51-70 大部分是 TARGET_* 效果，用 settle_state 默认 target
  41: { type: 'settle_state', params: { state: '皮肤', baseValue: 30 } },
  42: { type: 'settle_state', params: { state: '胸部', baseValue: 30 } },
  43: { type: 'settle_state', params: { state: '阴蒂', baseValue: 30 } },
  44: { type: 'settle_state', params: { state: '阴茎', baseValue: 30 } },
  45: { type: 'settle_state', params: { state: '阴道', baseValue: 30 } },
  46: { type: 'settle_state', params: { state: '肛肠', baseValue: 30 } },
  47: { type: 'settle_state', params: { state: '尿道', baseValue: 30 } },
  48: { type: 'settle_state', params: { state: '子宫', baseValue: 30 } },
  49: { type: 'settle_state', params: { state: '欲情', baseValue: 30 } },
  51: { type: 'settle_state', params: { state: '快乐', baseValue: 30 } },
  52: { type: 'settle_state', params: { state: '恭顺', baseValue: 30 } },
  53: { type: 'settle_state', params: { state: '好意', baseValue: 30 } },
  54: { type: 'settle_state', params: { state: '羞耻', baseValue: 30 } },
  55: { type: 'settle_state', params: { state: '屈服', baseValue: 30 } },
  56: { type: 'settle_state', params: { state: '先导', baseValue: 30 } },
  57: { type: 'settle_state', params: { state: '屈服', baseValue: 30 } },
  58: { type: 'settle_state', params: { state: '润滑', baseValue: 30 } },
  59: { type: 'settle_state', params: { state: '苦痛', baseValue: 30 } },
  60: { type: 'settle_state', params: { state: '恐怖', baseValue: 30 } },
  62: { type: 'settle_state', params: { state: '苦痛', baseValue: 30 } },
  70: { type: 'settle_state', params: { state: '恐怖', baseValue: 30 } },
  71: { type: 'settle_state', params: { state: '习得', baseValue: 30 } },
  81: { type: 'settle_state', params: { state: '习得', baseValue: 30 } },
  86: { type: 'settle_state', params: { state: '先导', baseValue: 30 } },

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
  // 精确匹配 TO_DO 前提（不是子串匹配！）
  if (instruct.premises) {
    const premiseList = instruct.premises.split('|')
    if (premiseList.some(p => p.trim() === 'TO_DO')) return true
  }
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

  // CVE 复合效果——每个 CVE 独立一个条件效果
  const cveMatch = effId.match(/^CVE_A(\d)_E\|(\d+)_G_(\d+)$/)
  if (cveMatch) {
    const who = cveMatch[1] === '1' ? 'player' : 'target'
    const expId = cveMatch[2]
    const threshold = parseInt(cveMatch[3])
    // CVE 是独立的条件性 add_experience 效果
    return {
      type: 'h_experience',
      params: { expId: expId, value: 1 },
      condition: `${who}.experience.${expId} >= ${threshold}`,
    }
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
    const feelMap = {
      101: '快乐', 110: '皮肤', 111: '皮肤', 112: '胸部', 114: '阴道',
      115: '肛肠', 116: '尿道', 117: '子宫', 118: '口喉', 119: '兽部',
      120: '阴茎', 141: '皮肤', 142: '口喉', 143: '脚', 144: '胸部',
      145: '阴道', 146: '肛肠', 154: '胸部', 155: '阴蒂',
      159: '阴道', 161: '肛肠', 163: '尿道', 165: '子宫', 171: '口喉',
    }
    const feelTechMap = { 110: 1, 111: 1, 112: 1, 114: 1, 115: 1, 116: 1, 117: 1, 118: 1, 119: 1 }
    const part = feelMap[numId]
    if (part) {
      // tech_adjust 效果（带体技修正） vs 普通 settle_state
      if (feelTechMap[numId] || (numId >= 110 && numId <= 146)) {
        return { type: 'tech_adjust', params: { part, baseValue: 50 } }
      }
      return { type: 'settle_state', params: { state: part, baseValue: 50 } }
    }
  }

  // 位置效果 (800-862) — 插入位置
  if (numId >= 800 && numId <= 840) {
    const posMap = {
      800: -1, 801: -1, 802: 0, 803: 1, 804: 2, 805: 3, 806: 4, 807: 5,
      808: 6, 809: 7, 810: 8, 811: 9, 812: 10, 813: 11, 814: 12, 815: 13,
      816: 14, 817: 15, 821: 20, 822: 21, 823: 22, 824: 23, 825: 24,
      826: 25, 827: 26, 828: 27, 829: 28, 830: 29, 831: 30, 832: 31, 833: 32, 834: 33,
    }
    if (numId === 800) return { type: 'set_field', params: { path: 'scene_all.h_state.insert_position', value: -1 } }
    if (numId === 840) return { type: 'set_field', params: { path: 'h_state.insert_position', value: -1 } }
    const val = posMap[numId]
    if (val !== undefined) return { type: 'set_field', params: { path: 'h_state.insert_position', value: val } }
  }
  // 体位效果 (850-862)
  if (numId >= 850 && numId <= 862) {
    const posMap = { 850: -1, 851: 1, 852: 2, 853: 3, 854: 4, 855: 5, 856: 6, 857: 7, 858: 8, 859: 9, 860: 10, 861: 11, 862: 12 }
    const val = posMap[numId]
    if (val !== undefined) return { type: 'set_field', params: { path: 'h_state.current_sex_position', value: val } }
  }

  // 服饰效果 (600-649)
  if (numId >= 600 && numId < 650) {
    const clothMap = {
      601: { type: 'cloth_set_visible', params: { part: '内衣', visible: true } },
      603: { type: 'cloth_set_visible', params: { part: '胸罩', visible: true } },
      605: { type: 'cloth_set_visible', params: { part: '内裤', visible: true } },
      608: { type: 'cloth_set_visible', params: { part: 'all', visible: true } },
      621: { type: 'set_field', params: { path: 'inventory.panty_collected', value: true } },
      622: { type: 'set_field', params: { path: 'inventory.socks_collected', value: true } },
      623: { type: 'set_field', params: { path: 'scene_all.inventory.panty_collected', value: true } },
      624: { type: 'set_field', params: { path: 'scene_all.inventory.socks_collected', value: true } },
      631: { type: 'cloth_wear_all', params: {} },
      632: { type: 'cloth_remove_all', params: {} },
      633: { type: 'cloth_set_visible', params: { part: '浴巾', visible: true } },
      634: { type: 'cloth_set_visible', params: { part: '睡衣', visible: true } },
      635: { type: 'cloth_wear_all', params: { target: 'self' } },
      636: { type: 'cloth_wear_all', params: { target: 'scene_all' } },
    }
    if (clothMap[numId]) return { ...clothMap[numId], params: { ...clothMap[numId].params } }
  }

  // H 特殊效果 (400-699)
  if (numId === 301) return { type: 'set_field', params: { path: 'sp_flag.shower_state', value: 0 } }
  if (numId === 321) return { type: 'set_field', params: { path: 'sp_flag.sleeping', value: false } }
  if (numId === 331) return { type: 'set_field', params: { path: 'sp_flag.peeing', value: false } }
  if (numId === 336) return { type: 'set_field', params: { path: 'sp_flag.milking', value: false } }
  if (numId === 371) return { type: 'set_field', params: { path: 'sp_flag.maintenance_done', value: true } }
  if (numId === 404) return { type: 'set_field', params: { path: 'h_state.is_h', value: false } }
  if (numId === 405) return { type: 'set_field', params: { path: 'h_state.orgasm_level_sync', value: true } }
  if (numId === 406) return { type: 'set_field', params: { path: 'h_state.is_h', value: true } }
  if (numId === 407) return { type: 'set_field', params: { path: 'scene_all.h_state.is_h', value: false } }
  if (numId === 461) return { type: 'set_field', params: { path: 'h_state.npc_active_h', value: false } }
  if (numId === 462) return { type: 'set_field', params: { path: 'h_state.npc_active_h', value: true } }
  if (numId === 463) return { type: 'set_field', params: { path: 'target.h_state.npc_active_h', value: false } }
  if (numId === 464) return { type: 'set_field', params: { path: 'target.h_state.npc_active_h', value: true } }
  if (numId === 480) return { type: 'set_field', params: { path: 'sp_flag.last_conscious_h_time', value: 'now' } }
  if (numId === 481) return { type: 'set_field', params: { path: 'sp_flag.last_unconscious_h_time', value: 'now' } }
  if (numId === 484) return { type: 'set_field', params: { path: 'sp_flag.unconscious_h', value: 3 } }
  if (numId === 526) return { type: 'set_field', params: { path: 'h_state.orgasm_edge', value: 2 } }
  if (numId === 527) return { type: 'set_field', params: { path: 'h_state.time_stop_release', value: true } }
  if (numId === 528) return { type: 'modify_attribute', params: { attr: '体力上限', value: '+orgasm*2' } }
  if (numId === 535) return { type: 'set_field', params: { path: 'sp_flag.prisoners_trained', value: true } }
  if (numId === 538) return { type: 'modify_relation', params: { relation: '好感度', value: 10 } }
  if (numId === 701) return { type: 'set_field', params: { path: 'sp_flag.last_training_time', value: 'now' } }
  if (numId === 702) return { type: 'set_field', params: { path: 'sp_flag.last_shower_time', value: 'now' } }
  if (numId === 703) return { type: 'set_field', params: { path: 'sp_flag.wake_time', value: 'now' } }
  if (numId === 704) return { type: 'set_field', params: { path: 'sp_flag.last_conscious_h_time', value: 'now' } }
  if (numId === 752) return { type: 'set_field', params: { path: 'scene.close_flag', value: 1 } }
  if (numId === 753) return { type: 'set_field', params: { path: 'scene.close_flag', value: 0 } }
  if (numId === 1406) return { type: 'set_field', params: { path: 'h_state.just_shoot', value: false } }
  if (numId === 1409) return { type: 'set_field', params: { path: 'target.h_state.condom_info_show', value: true } }
  if (numId === 1410) return { type: 'set_field', params: { path: 'scene_all.h_state.condom_info_show', value: true } }
  if (numId === 1413) return { type: 'set_field', params: { path: 'h_state.orgasm_edge', value: 1 } }
  if (numId === 1513) return { type: 'modify_attribute', params: { attr: '体力', value: -25, target: 'self' } }
  if (numId === 1514) return { type: 'modify_attribute', params: { attr: '气力', value: -25, target: 'self' } }
  if (numId === 1519) return { type: 'modify_attribute', params: { attr: '体力', value: -50, target: 'target' } }
  if (numId === 1520) return { type: 'modify_attribute', params: { attr: '气力', value: -50, target: 'target' } }

  // 时停效果 (1241-1246)
  if (numId === 1241) return { type: 'time_stop_on', params: {} }
  if (numId === 1242) return { type: 'time_stop_off', params: {} }
  if (numId === 1243) return { type: 'time_stop_carry', params: {} }
  if (numId === 1244) return { type: 'time_stop_carry_stop', params: {} }
  if (numId === 1246) return { type: 'time_stop_free_stop', params: {} }

  // 群交模式
  if (numId === 10010) return { type: 'group_sex_mode_on', params: {} }
  if (numId === 10011) return { type: 'group_sex_mode_off', params: {} }

  // 道具效果 (900-929)
  if (numId >= 911 && numId <= 928) {
    const toyOn = { 911: '振动棒V', 913: '振动棒A', 915: '乳头夹', 917: '阴蒂夹', 919: '拉珠', 921: '搾乳机', 923: '采尿器', 925: '眼罩', 927: '口球' }
    const toyOff = { 912: '振动棒V', 914: '振动棒A', 916: '乳头夹', 918: '阴蒂夹', 920: '拉珠', 922: '搾乳机', 924: '采尿器', 926: '眼罩', 928: '口球' }
    if (toyOn[numId]) return { type: 'body_item_equip', params: { item: toyOn[numId] } }
    if (toyOff[numId]) return { type: 'body_item_unequip', params: { item: toyOff[numId] } }
  }

  // 药物效果 (1001-1012)
  if (numId === 1001) return { type: 'apply_lubricant', params: { value: 10000 } }
  if (numId === 1002) return { type: 'apply_aphrodisiac', params: {} }
  if (numId === 1007) return { type: 'set_field', params: { path: 'sp_flag.sleep_pill_effect', value: true } }
  if (numId === 1008) return { type: 'set_field', params: { path: 'sp_flag.ovulation_promoted', value: true } }
  if (numId === 1009) return { type: 'set_field', params: { path: 'sp_flag.contraceptive_before', value: true } }
  if (numId === 1010) return { type: 'set_field', params: { path: 'sp_flag.contraceptive_after', value: true } }
  if (numId === 1011) return { type: 'set_field', params: { path: 'h_state.condom', value: true } }
  if (numId === 1012) return { type: 'set_field', params: { path: 'h_state.condom', value: false } }

  // 首次效果 (1101-1109)
  if (numId === 1101) return { type: 'set_field', params: { path: 'sp_flag.first_kiss', value: true } }
  if (numId === 1103) return { type: 'set_field', params: { path: 'sp_flag.first_vaginal', value: true } }
  if (numId === 1104) return { type: 'set_field', params: { path: 'sp_flag.first_anal', value: true } }
  if (numId === 1107) return { type: 'set_field', params: { path: 'sp_flag.first_penis_kiss', value: true } }
  if (numId === 1108) return { type: 'set_field', params: { path: 'sp_flag.first_urethral', value: true } }
  if (numId === 1109) return { type: 'set_field', params: { path: 'sp_flag.first_womb', value: true } }

  // 源石技艺效果 (1201-1204) — 跳过（方舟特有）
  if (numId === 1201 || numId === 1202 || numId === 1203 || numId === 1204) {
    return { type: '_unknown', params: { erArkId: String(numId), note: '源石技艺-跳过' } }
  }

  // 催眠效果 (1211-1231)
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

  // 疼痛系 tech_adjust (121-135)
  if ((numId >= 121 && numId <= 125) || (numId >= 131 && numId <= 135)) {
    return { type: 'tech_adjust', params: { type: 'pain', erArkId: numId } }
  }

  // 更多体位 (866-868)
  if (numId >= 866 && numId <= 868) {
    const pos = { 866: 13, 867: 14, 868: 15 }
    return { type: 'set_field', params: { path: 'h_state.insert_position', value: pos[numId] || 0 } }
  }

  // 道具使用消耗 (941-955) — 物品系统自动处理消耗，无需额外效果
  if (numId >= 941 && numId <= 955) {
    return { type: 'nop', params: {} }
  }

  // 远程玩具 (1055-1063) — 用已有 vibrator_set 档位控制
  // 1055=关→level=0, 1056=弱→level=1, 1057=中→level=2, 1058=强→level=3
  // 1059=全员关, 1060=全员弱, 1061=全员中, 1062=全员强
  if (numId >= 1055 && numId <= 1062) {
    const levels = { 1055: 0, 1056: 1, 1057: 2, 1058: 3, 1059: 0, 1060: 1, 1061: 2, 1062: 3 }
    const lv = levels[numId] ?? 0
    return { type: 'vibrator_set', params: { level: lv } }
  }
  if (numId === 1063) return { type: 'vibrator_set', params: { level: 1 } }

  // 药物补充 (1003-1006)
  if (numId === 1003) return { type: 'apply_lubricant', params: { value: 5000, target: 'anal' } }
  if (numId === 1004) return { type: 'set_field', params: { path: 'h_state.enema_active', value: false } }
  if (numId === 1005) return { type: 'modify_attribute', params: { attr: '尿意', value: 300 } }
  if (numId === 1006) return { type: 'set_field', params: { path: 'sp_flag.diuretic_effect', value: true } }

  // 153 = 疼痛, 201 = 工作相关
  if (numId === 153) return { type: 'modify_attribute', params: { attr: '体力', value: -30 } }
  if (numId === 201) return { type: 'set_field', params: { path: 'sp_flag.work_related', value: true } }

  // 1721-1722 = 移动/行为
  if (numId === 1721) return { type: 'set_field', params: { path: 'sp_flag.moving_to_dormitory', value: true } }
  if (numId === 1722) return { type: 'set_field', params: { path: 'h_state.endurance_released', value: true } }

  // 9999 = 无效果（占位）
  if (numId === 9999) return { type: 'nop', params: {} }

  // 经验/计数效果 (500-599)
  if (numId >= 500 && numId < 600) {
    const expMap = {
      501: { type: 'h_experience', params: { expId: 'social', value: 1 } },
      502: { type: 'h_experience', params: { expId: 'domestic', value: 1 } },
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

    // 翻译效果
    const effects = []
    for (const effId of erArkEffectIds) {
      const translated = translateEffect(effId)
      const eff = { type: translated.type, params: { ...translated.params } }
      if (translated.condition) eff.condition = translated.condition
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
