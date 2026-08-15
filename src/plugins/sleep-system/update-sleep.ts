// 睡眠结算对全员（erArk sleep_settle.update_sleep()：npc_id_got + {0}——sleep_settle.py:45-100）
// 玩家睡觉指令执行后调用（sleep-system execution_end 监听，时长为睡眠实际分钟数）：
//   全员：宝珠转换（settle_character_juel：状态值→宝珠+清零，:52/:103-151——2026-08-11
//         完整复刻，此前宝珠系统被砍只留 daily_reset 清零）→ 其余 daily_reset 属性清零
//   玩家：eja_point=0（:56，无条件）/ day_first_shoot_semen=True（:57，无条件）/
//         醒来时间记录 / 精液转化（refresh_temp_semen_max，≥6h）/ 精力成长（:55 sanity_point_grow，
//         2026-08-11 完整复刻：today_cost ≥50 → 精力上限 += round/50，cap 9999）/
//         能力升级（:75 gain_ability，mod 开关 upgrade_on_player_sleep）
//   NPC：愤怒 rand(1,35)（:80）/ h_interrupt=0（:82）/ day_first_meet=1（:84）/
//         妊娠检查（:88，TODO）/ 素质获得（:90 gain_talent gain_type=3）/
//         能力升级（:92，mod 开关 upgrade_on_npc_sleep）/
//         H 状态完全重置（:95 get_h_state_reset）/ sleep_h_awake=False（:97）
// 注：NPC 的 sp_flag.sleeping/unnormal 标记由 npc:behavior_started 管理（睡眠行为结束自然清除），
// 本函数不清——玩家睡眠不代表 NPC 立即醒来（erArk 同构：update_sleep 不触碰行为）

import { entitySystem } from '../../core/entity-system'
import { gameContext } from '../../core/game-context'
import { eventBus } from '../../core/event-bus'
import { errorReporter } from '../../core/error-reporter'
import { getEntityAttr, setEntityAttr, ATTR } from '../../core/entity-utils'
import { settleDailyReset } from '../../core/realtime-settle'
import { settleJuelConversion } from '../../core/juel-settle'
import { checkTalentGain } from '../../core/talent-utils'
import { narrativeLog } from '../../core/narrative-log'
import { apiSystem } from '../../core/api'
import { modLoader } from '../../core/mod-loader'
import { clearAsleep } from './sleep-state'

// 精力成长（erArk sleep_settle.sanity_point_grow：today_cost ≥50 → 上限 += round/50，cap 9999）
// 2026-08-11 完整复刻：精力消耗方 = h-hypnosis 催眠/体控指令（原"精神"属性已删，对账表重对账）
function growStaminaMax(char: any): void {
  if (!char.action_info) char.action_info = {}
  const todayCost = char.action_info.today_sanity_point_cost ?? 0
  char.action_info.today_sanity_point_cost = 0
  if (todayCost < 50) return
  const staminaMax = getEntityAttr(char, ATTR.STAMINA_MAX)
  if (typeof staminaMax !== 'number' || staminaMax >= 9999) return
  const grow = Math.round(todayCost / 50)
  const next = Math.min(9999, staminaMax + grow)
  setEntityAttr(char, ATTR.STAMINA_MAX, next)
  const charName = (char as any).name ?? char.id
  // 叙事输出（erArk "在刻苦的锻炼下，博士理智最大值成长了X点"）
  narrativeLog.write(`在刻苦的锻炼下，${charName}精力最大值成长了${grow}点`, 'system', 'sleep-system')
}

// 精液转化（erArk sleep_settle.refresh_temp_semen_max：睡眠时长 ≥6h 且 当前精液 >0 →
// 额外精液 += floor(精液/2)，上限 精液上限×4；满则获得"浓厚精液"天赋）
// 注：erArk 在行为开始时（judge_before_pl_behavior）用睡前精液量转化；本引擎在
// realtimeSettle 之后执行（基数含睡眠中的精液恢复 +1/20min），偏差量级为小时级恢复量
function refreshTempSemenMax(char: any, minutes: number): void {
  if (minutes < 360) return
  const semen = getEntityAttr(char, ATTR.SEMEN)
  const semenMax = getEntityAttr(char, ATTR.SEMEN_MAX)
  if (typeof semen !== 'number' || semen <= 0) return
  if (typeof semenMax !== 'number' || semenMax <= 0) return
  const extraMax = semenMax * 4
  const extra = getEntityAttr(char, ATTR.EXTRA_SEMEN)
  const newExtra = Math.min(extraMax, (typeof extra === 'number' ? extra : 0) + Math.floor(semen / 2))
  setEntityAttr(char, ATTR.EXTRA_SEMEN, newExtra)
  if (!char.talents) char.talents = {}
  if (newExtra >= extraMax) {
    char.talents['浓厚精液'] = 1
  } else {
    delete char.talents['浓厚精液']
  }
}

// 能力升级结算（erArk handle_ability.gain_ability）——经 API 调 ability-progression（跨插件通信铁律）
async function settleAbilityUpgrade(charId: string): Promise<void> {
  try {
    await apiSystem.call('abilities', 'checkUpgrade', charId)
  } catch (err) {
    errorReporter.report({
      source: 'sleep-system',
      severity: 'warning',
      message: `睡眠结算能力升级失败（${charId}）：${err instanceof Error ? err.message : String(err)}`,
      suggestion: '检查 ability-progression 插件是否已加载',
    })
  }
}

export async function updateSleepAll(minutes: number): Promise<void> {
  const playerId = gameContext.getContext().player?.id
  const now = gameContext.getContext().time
  const mod = modLoader.getMod()
  const settings = mod?.upgradeSettings ?? { player_sleep: true, npc_sleep: true, npc_h_end: true }

  for (const char of entitySystem.getAll('character')) {
    const c = char as any
    if (!c?.id) continue
    const isPlayer = c.id === playerId

    // 全员：宝珠转换（状态值→宝珠 + 清零，erArk :52/:103-151）+ 其余 daily_reset 清零
    const juelTexts = settleJuelConversion(c)
    settleDailyReset(c)
    if (juelTexts.length > 0) {
      narrativeLog.write(`${c.name ?? c.id}：${juelTexts.join('，')}`, 'system', 'sleep-system')
    }

    if (isPlayer) {
      // 玩家分支
      if (!c.action_info) c.action_info = {}
      // eja_point = 0（erArk sleep_settle.py:56，无条件——射精欲不清则睡醒仍满）
      // 写路径走 h-ejaculation setEja API（射精欲唯一写入口，C5 修复——跨插件禁止直接改字段；
      // 未启用 → 静默降级；真实错误照报——与 h-core settle/eja.ts 同模式，禁止裸 catch 吞错）
      try {
        await apiSystem.call('h-ejaculation', 'setEja', c.id, 0)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const apiMissing = msg.includes('h-ejaculation') || msg.includes('未注册') || msg.includes('does not exist')
        if (!apiMissing) {
          errorReporter.report({
            source: 'sleep-system',
            severity: 'error',
            message: `睡眠结算射精欲清零失败（${c.id}）：${msg}`,
          })
        }
      }
      // day_first_shoot_semen = True（:57，无条件——睡醒第一发翻倍）
      c.action_info.day_first_shoot_semen = true
      // 醒来时间记录（erArk RECORD_WAKE_TIME 语义 + game_type.py:600 wake_time）
      c.action_info.wake_time = now
      // 精液转化（≥6h）
      refreshTempSemenMax(c, minutes)
      // 精力成长（:55 sanity_point_grow——2026-08-11 完整复刻）
      growStaminaMax(c)
      // 能力升级检测（:75 gain_ability；mod 开关 upgrade_on_player_sleep）
      if (settings.player_sleep) {
        await settleAbilityUpgrade(c.id)
      }
      clearAsleep(c)
    } else {
      // NPC 分支
      if (!c.base) c.base = {}
      // 愤怒重置（erArk sleep_settle.py:80 random.randrange(1,35) = 1..34——M1 修复 off-by-one）
      c.base[ATTR.ANGER] = 1 + Math.floor(Math.random() * 34)
      if (!c.action_info) c.action_info = {}
      // h_interrupt = 0（:82——H 被撞破标记清零）
      c.action_info.h_interrupt = 0
      // day_first_meet = 1（:84——每天第一次见面重置）；first_record 缺失则跳过（字段未实装）
      if (c.first_record) {
        c.first_record.day_first_meet = 1
      }
      // TODO(sleep-system)：妊娠检查（pregnancy.check_all_pregnancy——h-pregnancy 无 check_all 对等 API，
      // 现有 isPregnant/getDays 为查询用；受精检查随 h-pregnancy 扩展接入）
      // 素质获得（:90 gain_talent now_gain_type=3——checkTalentGain 按 gain_type=3 + needs/condition）
      try {
        checkTalentGain(c.id, 3)
      } catch (err) {
        // G 修复（第四轮）：错误处理铁律——禁止静默 catch
        errorReporter.report({
          source: 'sleep-system',
          severity: 'warning',
          message: `睡眠结算素质获得失败（${c.id}）：${err instanceof Error ? err.message : String(err)}`,
        })
      }
      // 能力升级检测（:92；mod 开关 upgrade_on_npc_sleep）
      if (settings.npc_sleep) {
        await settleAbilityUpgrade(c.id)
      }
      // H 状态完全重置（:95 get_h_state_reset——h_state 置空为无 H 状态规范表示）
      c.h_state = undefined
      // sleep_h_awake = False（:97——睡奸醒来标记清除）
      if (!c.sp_flag) c.sp_flag = {}
      c.sp_flag.sleep_h_awake = false
      c.sleep_h_awake = false
      // 睡眠无意识残留清除（C1 修复：睡奸结束若未走 6005，unconscious_h=1 会让跳过集
      // 永久冻结 NPC——睡醒结算兜底；醉酒=2/催眠=4-7 是独立系统状态，不清；时停=3 由
      // h-time-stop 管理，不清）
      if (c.sp_flag.unconscious_h === 1) {
        c.sp_flag.unconscious_h = 0
        // B1 修复：清 0x30 后若仍 sleeping（真睡眠者）→ 重新置位（不变量：sleeping ⟺ bit5|6）
        c.sp_flag.unnormal_flag = c.sp_flag.sleeping
          ? ((c.sp_flag.unnormal_flag ?? 0) | 0x30)
          : ((c.sp_flag.unnormal_flag ?? 0) & ~0x30)
      }
    }

    eventBus.emit('character:changed', { id: c.id })
  }
}
