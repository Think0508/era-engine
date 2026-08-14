// 注释：囚犯生命周期——charaBecomePrisoner / 释放 / 牢房分配 / 囚服 / 强制刻印
// erArk 对照：confinement_and_training.py chara_become_prisoner（:180）/ get_unused_prison_dormitory（:226）
// / clothing.py handle_prisoner_clothing（:111）
//
// 流程（grill Q4 定案）：投牢指令 → setOnline 到当前点 → charaBecomePrisoner()（本文件）
// 释放：清 flag/位2/囚犯记录 → 回 pre_dormitory 或 home_locations 最高权重 → 取回衣服

import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { gameContext } from '../../core/game-context'
import { modLoader } from '../../core/mod-loader'
import { apiSystem } from '../../core/api'
import {
  UNNORMAL_BIT_2, getPrisoners, getSettings, getPreDormitory, setPreDormitory,
} from './state'

// 注释：监狱地点 tag 约定（erArk 场景 tag Prison）——牢房 = 带此 tag 的地点
export const PRISON_TAG = 'prison'
// 注释：调教室 tag（erArk Humiliation_Room，阶段C 用）
export const HUMILIATION_ROOM_TAG = 'humiliation_room'
// 注释：监狱长办公室 tag（erArk Warden_Office，阶段C 用）
export const WARDEN_OFFICE_TAG = 'warden_office'

// 注释：空牢房分配（erArk get_unused_prison_dormitory）——遍历带 prison tag 的地点，
// 返回当前无囚犯的第一间；全满返回 ''（此时无法投牢/追捕归还）。
// 不硬编码牢房数（erArk 硬编码 8 间——本引擎通用化，牢房由 mod 地图定义）
// ⚠️ 2026-08-14 审查修复：原 extra 判断 `sp_flag.pre_dormitory === locId` 语义错误
// （pre_dormitory 是入狱前住处不是牢房；且释放已清空）——只按 current_location 判定
export function getUnusedPrisonCell(): string {
  const mod = modLoader.getMod()
  if (!mod) return ''
  const occupied = new Set(Object.keys(getPrisoners()))
  for (const [locId, loc] of mod.locations) {
    if (!loc.tags?.includes(PRISON_TAG)) continue
    // 注释：占用判断——囚犯 current_location == 牢房
    let hasPrisoner = false
    for (const pid of occupied) {
      const c = entitySystem.get('character', pid) as any
      if (c?.current_location === locId) { hasPrisoner = true; break }
    }
    if (!hasPrisoner) return locId
  }
  return ''
}

// 注释：角色成为囚犯（erArk chara_become_prisoner 全流程）
// 调用方负责先把角色 setOnline 到牢房位置
export async function charaBecomePrisoner(charId: string): Promise<void> {
  const char = entitySystem.get('character', charId) as any
  if (!char) {
    errorReporter.report({
      source: 'confinement-system',
      severity: 'warning',
      message: `charaBecomePrisoner：角色 '${charId}' 不存在`,
    })
    return
  }
  if (!char.sp_flag) char.sp_flag = {}

  // 1. flag 结算（erArk :183-187）
  char.sp_flag.be_bagged = false
  char.sp_flag.imprisonment = true
  char.sp_flag.escaping = false
  char.sp_flag.unnormal_flag = (char.sp_flag.unnormal_flag ?? 0) | UNNORMAL_BIT_2

  // 2. 加入囚犯记录 [关押时间, 逃脱概率 0]（erArk :189-190）
  const time = gameContext.getContext().time
  const prisoners = getPrisoners()
  if (!prisoners[charId]) {
    prisoners[charId] = {
      imprisonedAt: { ...time },
      escapeProbability: 0,
    }
  }

  // 3. 宿舍改为当前地点（牢房），保存旧宿舍（erArk :196-199）
  const currentLoc = char.current_location
  if (currentLoc && !getPreDormitory(charId)) {
    // 注释：pre_dormitory 只存一次（重囚/换牢房不覆盖）
    const home = bestHomeLocation(char)
    setPreDormitory(charId, home ?? '')
  }

  // 4. 服装（erArk handle_prisoner_clothing）——按设置 2/3
  await applyPrisonerClothing(char)

  // 5. 强制刻印（erArk :200-222）——按陷落等级减轻
  await applyForcedMarks(char)

  // 6. 事件广播
  eventBus.emit('confinement:imprisoned', { character: charId, location: currentLoc })
  eventBus.emit('character:changed', { id: charId })
  narrativeLog.write(`${char.name ?? charId} 被投入监牢。`, 'system', 'confinement-system')
}

// 注释：解除囚禁（erArk SET_FREE_ADD_ADJUST :7579）
// 调用方负责先确认在场（指令前提 SCENE_ONLY_TWO 已保证）
export async function charaRelease(charId: string): Promise<void> {
  const char = entitySystem.get('character', charId) as any
  if (!char) return
  if (!char.sp_flag) char.sp_flag = {}

  // 清 flag + 位2（erArk :7580-7581）
  char.sp_flag.imprisonment = false
  char.sp_flag.unnormal_flag = (char.sp_flag.unnormal_flag ?? 0) & ~UNNORMAL_BIT_2

  // 删囚犯记录（erArk :7585）
  delete getPrisoners()[charId]

  // 回旧宿舍（erArk :7582-7584）——走 character API moveTo（发 character:changed；
  // NPC 移动本不发 location:enter，与 npc-ai move 行为到达语义一致）
  const preDormitory = getPreDormitory(charId)
  if (preDormitory) {
    try {
      await apiSystem.call('character', 'moveTo', charId, preDormitory)
    } catch {
      char.current_location = preDormitory
    }
    char.sp_flag.pre_dormitory = ''
  }
  // 注释：无 pre_dormitory（直接被抓来的）→ 保持当前地点（释放原地）

  // 取回衣服（erArk get_cloth_from_dormitory_locker——本引擎简化：恢复 equipment）
  await restoreClothes(char)

  eventBus.emit('confinement:released', { character: charId })
  eventBus.emit('character:changed', { id: charId })
  narrativeLog.write(`${char.name ?? charId} 被释放了。`, 'system', 'confinement-system')
}

// ── 囚服管理（erArk handle_prisoner_clothing 简化）──
// 设置2（clothing）：0=全裸 / 1=囚服（mod 定义"囚服"物品，tag 约定）/ 2=正常衣服
// 设置3（underwear）：0=无 / 1=情趣内衣 / 2=正常内衣
// ⚠️ 本引擎服装系统简化：equipment/equipment_off 字段。全裸 = 清空 equipment；
// 囚服/正常衣服 = 从装备字段恢复（h-core cloth effect 已有类似语义）。
// TODO(confinement-system)：囚服物品定义与内裤/袜子槽位随 clothing 系统落地后精确化
async function applyPrisonerClothing(char: any): Promise<void> {
  const s = getSettings()
  if (s.clothing === 0) {
    // 全裸：清空所有装备（保存到 equipment_off，释放时恢复）
    if (char.equipment && Object.keys(char.equipment).length > 0) {
      char.equipment_off = { ...char.equipment_off, ...char.equipment }
      char.equipment = {}
    }
  }
  // clothing 1/2：保持现状（囚服物品定义随服装系统 TODO）
  // underwear：TODO(clothing)
}

async function restoreClothes(char: any): Promise<void> {
  if (char.equipment_off && Object.keys(char.equipment_off).length > 0) {
    char.equipment = { ...char.equipment, ...char.equipment_off }
    char.equipment_off = {}
  }
}

// ── 强制刻印（erArk chara_become_prisoner :200-222）──
// 屈服2 强制；恐怖1/反发1-3 视陷落等级（target_fall >= -2/-2/-1/0）
// 刻印能力位（h-mark）：14=屈服 / 17=恐怖 / 18=反发
// 能力名（'屈服刻印' 等）由 h-mark 插件定义（MARK_ABILITY），经 h-mark API 读写——
// 本插件不硬编码能力名，走 setField 到 abilities.{名} 由 mod 数据决定
const MARK_IDS = { YIELD: 14, TERROR: 17, HATE: 18 }

async function applyForcedMarks(char: any): Promise<void> {
  try {
    const fall = await getFallLevel(char.id)
    const marks = [
      { id: MARK_IDS.YIELD, target: 2, needFall: null },       // 屈服2 无条件
      { id: MARK_IDS.TERROR, target: 1, needFall: -2 },        // 恐怖1
      { id: MARK_IDS.HATE, target: 1, needFall: -2 },          // 反发1
      { id: MARK_IDS.HATE, target: 2, needFall: -1 },          // 反发2
      { id: MARK_IDS.HATE, target: 3, needFall: 0 },           // 反发3
    ]
    for (const m of marks) {
      if (m.needFall !== null && fall < m.needFall) continue
      await setMarkLevel(char.id, m.id, m.target)
    }
  } catch (err) {
    errorReporter.report({
      source: 'confinement-system',
      severity: 'warning',
      message: `强制刻印失败：${err instanceof Error ? err.message : String(err)}`,
      suggestion: '检查 h-mark 插件是否已加载',
    })
  }
}

// 注释：设置刻印等级——经 h-mark API setLevel（2026-08-14 审查修复：
// 原实现硬编码中文能力名（MARK_ABILITY_NAME）走 setField，违反「属性名禁止硬编码」铁律；
// h-mark 能力名由自身 MARK_ABILITY 契约决定，本插件只传 markId）
async function setMarkLevel(charId: string, markId: number, level: number): Promise<void> {
  try {
    await apiSystem.call('h-mark', 'setLevel', charId, markId, level)
  } catch (err) {
    errorReporter.report({
      source: 'confinement-system',
      severity: 'warning',
      message: `强制刻印设置失败：${err instanceof Error ? err.message : String(err)}`,
      suggestion: '检查 h-mark 插件是否已加载（setLevel API）',
    })
  }
}

// 注释：陷落等级（0=未陷落；爱情系 1-4；隶属系 -1~-4）
// 与 h-core premise-fall.ts getFallLevel 同语义（talents 爱情系/隶属系）
// 经 h-core API 获取失败时用本地实现（talents 数据在实体上，直接读）
const LOVE_TALENTS = ['思慕', '恋慕', '恋人', '爱侣']
const SUB_TALENTS = ['屈从', '驯服', '宠物', '奴隶']

export async function getFallLevel(charId: string): Promise<number> {
  const char = entitySystem.get('character', charId) as any
  if (!char?.talents) return 0
  for (let i = 0; i < LOVE_TALENTS.length; i++) {
    if (char.talents[LOVE_TALENTS[i]]) return i + 1
  }
  for (let i = 0; i < SUB_TALENTS.length; i++) {
    if (char.talents[SUB_TALENTS[i]]) return -(i + 1)
  }
  return 0
}

// 注释：home_locations 最高权重地点（character-system pickBestHomeLocation 同语义）
function bestHomeLocation(c: any): string | null {
  const home = c.behavior?.home_locations
  if (!home) return null
  let best: string | null = null
  let bestWeight = -1
  for (const [locId, weight] of Object.entries(home)) {
    if ((weight as number) > bestWeight) {
      bestWeight = weight as number
      best = locId
    }
  }
  return best
}
