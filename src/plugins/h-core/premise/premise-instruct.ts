import { entitySystem } from '../../../core/entity-system'
import { gameContext } from '../../../core/game-context'

function targetId(ctx: any): string | null {
  return ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId ?? null
}

function getTarget(ctx: any): any | null {
  const charId = targetId(ctx)
  if (!charId) return null
  return entitySystem.get('character', charId) as any ?? null
}

export function registerInstructPremises(registry: any): void {
  // ── Body part checks ──────────────────────────────────────
  function haveBodyPart(partField: string) {
    return (ctx: any) => {
      const ch = getTarget(ctx)
      if (!ch) return false
      return !!ch?.body_parts?.[partField]
    }
  }

  registry.register('TARGET_HAVE_HORN', haveBodyPart('horn'))
  registry.register('TARGET_HAVE_TAIL', haveBodyPart('tail'))
  registry.register('TARGET_HAVE_WING', haveBodyPart('wing'))
  registry.register('TARGET_HAVE_RING', haveBodyPart('ring'))
  registry.register('TARGET_HAVE_TENTACLE', haveBodyPart('tentacle'))
  registry.register('TARGET_HAVE_CAR', haveBodyPart('car'))
  registry.register('TARGET_HAVE_EARS', haveBodyPart('ears'))

  // ── Technique level checks ─────────────────────────────────
  function abilityLevelGe(abilityId: string, minLevel: number) {
    return (ctx: any) => {
      const ch = getTarget(ctx)
      if (!ch) return false
      return (ch?.abilities?.[abilityId]?.level ?? 0) >= minLevel
    }
  }

  registry.register('TARGET_TECHNIQUE_GE_3', abilityLevelGe('技巧', 3))
  registry.register('TARGET_TECHNIQUE_GE_5', abilityLevelGe('技巧', 5))
  registry.register('FINGER_TECHNIQUE_GE_3', abilityLevelGe('指技', 3))
  registry.register('FINGER_TECHNIQUE_GE_5', abilityLevelGe('指技', 5))
  registry.register('WAIST_TECHNIQUE_GE_3', abilityLevelGe('腰技', 3))
  registry.register('WAIST_TECHNIQUE_GE_5', abilityLevelGe('腰技', 5))
  registry.register('WAIST_TECHNIQUE_GE_7', abilityLevelGe('腰技', 7))

  // ── Position / penis state ────────────────────────────────
  function positionEquals(pos: string | null) {
    return (ctx: any) => {
      const ch = getTarget(ctx)
      return ch?.h_state?.position === pos
    }
  }

  registry.register('DR_POSITION_NULL', positionEquals(null))
  registry.register('DR_POSITION_NORMAL', positionEquals('normal'))
  registry.register('DR_POSITION_BACK', positionEquals('back'))
  registry.register('DR_POSITION_FACE_RIDE', positionEquals('face_ride'))
  registry.register('DR_POSITION_BACK_RIDE', positionEquals('back_ride'))
  registry.register('DR_POSITION_FACE_SEAT', positionEquals('face_seat'))
  registry.register('DR_POSITION_BACK_SEAT', positionEquals('back_seat'))
  registry.register('DR_POSITION_FACE_STAND', positionEquals('face_stand'))
  registry.register('DR_POSITION_BACK_STAND', positionEquals('back_stand'))
  registry.register('DR_POSITION_FACE_HUG', positionEquals('face_hug'))
  registry.register('DR_POSITION_BACK_HUG', positionEquals('back_hug'))
  registry.register('DR_POSITION_FACE_LIE', positionEquals('face_lie'))
  registry.register('DR_POSITION_BACK_LIE', positionEquals('back_lie'))

  registry.register('DR_HAVE_SEX_POSITION', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return ch?.h_state?.position != null && ch?.h_state?.position !== ''
  })

  // ── Insertion state ───────────────────────────────────────
  function insertionIn(part: string) {
    return (ctx: any) => {
      const ch = getTarget(ctx)
      if (!ch?.h_state?.insertion) return false
      const insertion = ch.h_state.insertion
      if (part === 'vagina_or_womb') {
        return insertion === 'vagina' || insertion === 'womb'
      }
      return insertion === part
    }
  }

  registry.register('PENIS_IN_T_VAGINA_OR_WOMB', insertionIn('vagina_or_womb'))
  registry.register('PENIS_IN_T_ANAL', insertionIn('anal'))
  registry.register('PENIS_IN_T_WOMB', insertionIn('womb'))
  registry.register('PENIS_IN_T_URETHRAL', insertionIn('urethral'))
  registry.register('PENIS_IN_T_MOUSE', insertionIn('mouth'))
  registry.register('PENIS_NOT_IN_T_MOUSE', (ctx: any) => !insertionIn('mouth')(ctx))

  // ── Dilate / aperture state ──────────────────────────────
  registry.register('TARGET_A_EMPTY', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch?.h_state) return true
    return ch.h_state.insertion == null || ch.h_state.insertion === ''
  })

  function dilateGe(part: string, minLevel: number) {
    return (ctx: any) => {
      const ch = getTarget(ctx)
      if (!ch?.h_state?.dilate) return false
      return (ch.h_state.dilate[part] ?? 0) >= minLevel
    }
  }

  registry.register('T_U_DILATE_GE_2', dilateGe('urethral', 2))
  registry.register('T_U_DILATE_GE_3', dilateGe('urethral', 3))
  registry.register('T_U_DILATE_GE_5', dilateGe('urethral', 5))
  registry.register('T_W_DILATE_GE_3', dilateGe('womb', 3))
  registry.register('T_W_DILATE_GE_5', dilateGe('womb', 5))

  // 注释：服装前提已由 premise-clothing.ts 注册

  // ── Location / place ─────────────────────────────────────────
  // 注释：位置前提（IN_*）已按架构决策迁移为 location.tags 检查（见 docs/instruction-replication/location-tags.md）
  // 指令 TOML 不再写 IN_* 前提，改用 condition = "location.tags.has_xxx == true"
  // 以下 PLACE_* 保留地点字段判断（furniture_count/door），不 tag 化

  registry.register('PLACE_FURNITURE_GE_1', (_ctx: any) => {
    const loc = gameContext.getContext().location
    if (!loc) return false
    return (loc as any).furniture_count >= 1
  })
  registry.register('PLACE_FURNITURE_GE_2', (_ctx: any) => {
    const loc = gameContext.getContext().location
    if (!loc) return false
    return (loc as any).furniture_count >= 2
  })
  registry.register('PLACE_FURNITURE_GE_3', (_ctx: any) => {
    const loc = gameContext.getContext().location
    if (!loc) return false
    return (loc as any).furniture_count >= 3
  })
  registry.register('PLACE_DOOR_LOCKABLE', (_ctx: any) => {
    const loc = gameContext.getContext().location
    if (!loc) return false
    return !!(loc as any).door
  })
  registry.register('PLACE_DOOR_OPEN', (_ctx: any) => {
    const loc = gameContext.getContext().location
    if (!loc) return false
    return (loc as any).door === 'open'
  })
  registry.register('PLACE_DOOR_CLOSE', (_ctx: any) => {
    const loc = gameContext.getContext().location
    if (!loc) return false
    return (loc as any).door === 'close'
  })

  // ── Item possession (inventory) ──────────────────────────────
  function hasItem(itemId: string) {
    return (ctx: any) => {
      const ch = getTarget(ctx)
      if (!ch) return false
      return !!ch?.inventory?.[itemId]
    }
  }

  registry.register('HAVE_BONDAGE', hasItem('绳子'))
  registry.register('HAVE_VIBRATOR', hasItem('震动棒'))
  registry.register('HAVE_PHILTER', hasItem('媚药'))
  registry.register('HAVE_CONDOM', hasItem('避孕套'))
  registry.register('HAVE_BODY_LUBRICANT', hasItem('润滑液'))
  registry.register('HAVE_PATCH', hasItem('贴片'))
  registry.register('HAVE_GAG', hasItem('口枷'))
  registry.register('HAVE_WHIP', hasItem('鞭子'))
  registry.register('HAVE_SAFE_CANDLES', hasItem('安全蜡烛'))
  registry.register('HAVE_CLYSTER_TOOLS', hasItem('灌肠用具'))
  registry.register('HAVE_MILKING_MACHINE', hasItem('挤奶机'))
  registry.register('HAVE_URINE_COLLECTOR', hasItem('集尿器'))
  registry.register('HAVE_COTTON_STICK', hasItem('棉棒'))
  registry.register('HAVE_LOVE_EGG', hasItem('跳蛋'))
  registry.register('HAVE_NIPPLE_CLAMP', hasItem('乳头夹'))
  registry.register('HAVE_CLIT_CLAMP', hasItem('阴蒂夹'))
  registry.register('HAVE_ANAL_BEADS', hasItem('肛珠'))
  registry.register('HAVE_ENEMAS', hasItem('灌肠液'))
  registry.register('HAVE_SLEEPING_PILLS', hasItem('安眠药'))
  registry.register('HAVE_DIURETICS_ONCE', hasItem('利尿剂瞬间'))
  registry.register('HAVE_DIURETICS_PERSISTENT', hasItem('利尿剂持续'))
  registry.register('HAVE_CLOMID', hasItem('克罗米芬'))
  registry.register('HAVE_BIRTH_CONTROL_PILLS_BEFORE', hasItem('事前避孕药'))
  registry.register('HAVE_BIRTH_CONTROL_PILLS_AFTER', hasItem('事后避孕药'))

  // ── Misc flags / state ──────────────────────────────────────
  registry.register('T_LACTATION_1', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !!ch?.sp_flag?.lactation
  })
  registry.register('T_INFLATION_1', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !!ch?.h_state?.inflation
  })
  registry.register('T_CHILD_OR_LOLI_1', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    const age = ch?.base?.age ?? ch?.base?.年龄 ?? 99
    return age <= 14
  })
  registry.register('T_MILK_GE_30', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return (ch?.base?.泌乳量 ?? 0) >= 30
  })
  registry.register('T_URINATE_GE_80', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return (ch?.base?.憋尿 ?? 0) >= 80
  })
  registry.register('NOW_CONDOM', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return ch?.h_state?.condom === true
  })
  registry.register('NOW_NOT_CONDOM', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return ch?.h_state?.condom !== true
  })
  function sexToyLevelGe(minLevel: number) {
    return (ctx: any) => {
      const ch = getTarget(ctx)
      if (!ch) return false
      return (ch?.h_state?.sex_toy_level ?? 0) >= minLevel
    }
  }
  // 注释：档位语义对齐 erArk handle_premise_H.py:3206/3229/3241——
  // WEAK==1 / MIDDLE==2 / STRONG==3（2026-08-08 审查修复：原 WEAK 误为 1-3、
  // STRONG 误为 >=4（vibrator_set 上限 3 → 恒 false 死键）、MIDDLE 缺失）
  function sexToyLevelEq(level: number) {
    return (ctx: any) => {
      const ch = getTarget(ctx)
      if (!ch) return false
      return (ch?.h_state?.sex_toy_level ?? 0) === level
    }
  }
  registry.register('TARGET_NOW_SEX_TOY_ON', sexToyLevelGe(1))
  registry.register('TARGET_NOW_SEX_TOY_OFF', (ctx: any) => !sexToyLevelGe(1)(ctx))
  registry.register('TARGET_NOW_SEX_TOY_WEAK', sexToyLevelEq(1))
  registry.register('TARGET_NOW_SEX_TOY_MIDDLE', sexToyLevelEq(2))
  registry.register('TARGET_NOW_SEX_TOY_STRONG', sexToyLevelEq(3))
  registry.register('TARGET_NOT_VIBRATOR_INSERTION', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !ch?.h_state?.vibrator_insertion
  })
  registry.register('TARGET_NOW_VIBRATOR_INSERTION', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !!ch?.h_state?.vibrator_insertion
  })
  registry.register('T_NOT_ENEMA', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !ch?.h_state?.enema
  })
  registry.register('T_ENEMA', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !!ch?.h_state?.enema
  })
  registry.register('T_ENEMA_CAPACITY_L_5', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return (ch?.h_state?.enema_capacity ?? 0) < 5
  })
  registry.register('DEBUG_MODE_ON', () => false)
  registry.register('DEBUG_MODE_OFF', () => true)

  // ═══════════════════════════════════════════════════════════════
  // T2：talk-common 迁移数据引用的 erArk 前提（2026-08-08 全量扫描补齐）
  // 原则：数据可判的注册真实语义；依赖未实装系统的注册恒 false + TODO 注释
  // （情境不存在 → 地文不可达是正确的；系统落地时补语义，校验测试持续盯防新增未注册前提）
  // ═══════════════════════════════════════════════════════════════

  // ── 无意识系列（unconscious_h 数据存在：时停=3、催眠=4-7、睡眠=1 待 L1.7）──
  // erArk handle_premise_sp_flag.py:1804/1834 等：t_unconscious_flag = 任意无意识；
  // t_unconscious_flag_N = unconscious_h === N
  registry.register('T_UNCONSCIOUS_FLAG', (ctx: any) => {
    const ch = getTarget(ctx)
    return !!ch?.sp_flag?.unconscious_h
  })
  for (let n = 1; n <= 6; n++) {
    const level = n
    registry.register(`T_UNCONSCIOUS_FLAG_${level}`, (ctx: any) => {
      const ch = getTarget(ctx)
      return ch?.sp_flag?.unconscious_h === level
    })
  }

  // ── 位置类（location.tags 可判）──
  registry.register('H_IN_BATHROOM', (_ctx: any) => {
    const tags = gameContext.getContext().location?.tags ?? []
    return tags.includes('has_bathroom')
  })
  registry.register('H_IN_LOVE_HOTEL', (_ctx: any) => {
    const tags = gameContext.getContext().location?.tags ?? []
    return tags.includes('has_love_hotel')
  })

  // ── 宝珠等级（宝珠系统未实装 → 无宝珠 = 等级 0）──
  registry.register('JJ_0', () => true)
  for (let n = 1; n <= 3; n++) {
    registry.register(`JJ_${n}`, () => false)  // TODO 宝珠系统未实装
  }

  // ── 玩家射精/精液前提（射精系统已实装：射精欲/精液量/额外精液量 属性 + dirty 污染）──
  // erArk handle_premise_H.py:1448-1664（查玩家 character_data[0]）
  // eja_point 阈值：LOW<=300 / MIDDLE<=600 / HIGH<=900 / EXTREME>900（累计上界语义 →
  // LOW_OR_MIDDLE=<=600 / HIGH_OR_EXTREME=>600）
  // 2026-08-08 审查修复：原恒 false → 阴茎短词池（penis.toml 240 条）全部不可达，
  // 行为地文里的 {penis} 永远原样输出（静默失效）
  function getPlayerChar(): any | null {
    const player = gameContext.getContext().player
    if (!player?.id) return null
    return entitySystem.get('character', player.id) as any ?? null
  }
  const plSemenTotal = (): number => {
    const p = getPlayerChar()
    return (p?.base?.['精液量'] ?? 0) + (p?.base?.['额外精液量'] ?? 0)
  }
  registry.register('PL_EJA_POINT_LOW_OR_MIDDLE', () => {
    const p = getPlayerChar()
    return (p?.base?.['射精欲'] ?? 0) <= 600
  })
  registry.register('PL_EJA_POINT_HIGH_OR_EXTREME', () => {
    const p = getPlayerChar()
    // 注释：>600 是"高或极"的意图语义（低中=≤600 的互补分区）。
    // erArk 字面实现有 bug：HIGH 只查上界 ≤900（覆盖全区间）→ HIGH_OR_EXTREME 恒 true；
    // 我们取意图语义（对齐项目修复 erArk 死代码的既有先例），数值 600 可追溯 MIDDLE 阈值
    return (p?.base?.['射精欲'] ?? 0) > 600
  })
  registry.register('PL_SEMEN_LE_2', () => plSemenTotal() <= 2)
  registry.register('PL_SEMEN_G_2', () => plSemenTotal() > 2)
  registry.register('PL_SEMEN_L_100', () => plSemenTotal() < 100)
  registry.register('PL_SEMEN_GE_100', () => plSemenTotal() >= 100)
  registry.register('PL_PENIS_NOT_SEMEN_DIRTY', () => {
    const p = getPlayerChar()
    return !p?.dirty?.penis_dirty_dict?.semen
  })
  registry.register('PL_PENIS_SEMEN_DIRTY', () => {
    const p = getPlayerChar()
    return !!p?.dirty?.penis_dirty_dict?.semen
  })

  // ── 逆推前提（erArk handle_premise_H.py:2031-2044）──
  // 2026-08-11：从恒 false 占位升级为真语义（h-npc-ai 插件消费；npc_active_h 属 h_state
  // 类型域 = h-core；逆推中普通 H 指令因 T_NPC_NOT_ACTIVE_H 失败而隐藏，keep_enjoy 等
  // 逆推专属指令因 T_NPC_ACTIVE_H 通过——erArk 同款前提过滤隐藏制）
  const npcActive = (char: any): boolean =>
    char?.h_state?.npc_active_h === true || char?.hypnosis?.active_h === true
  registry.register('T_NPC_ACTIVE_H', (ctx: any) => {
    const id = targetId(ctx)
    if (!id) return false
    return npcActive(entitySystem.get('character', id))
  })
  registry.register('T_NPC_NOT_ACTIVE_H', (ctx: any) => {
    const id = targetId(ctx)
    if (!id) return false
    return !npcActive(entitySystem.get('character', id))
  })
  registry.register('NPC_ACTIVE_H', (ctx: any) => {
    const id = ctx?.sourceId
    if (!id) return false
    return npcActive(entitySystem.get('character', id))
  })

  // ── 依赖未实装系统 → 恒 false（情境不存在，地文不可达）──
  // TODO 各系统落地时补语义（校验测试会盯防新未注册前提）：
  //   子宫体位（B3）/ 露出 / 隐奸 / 群交 / 逆推 / 催眠逆推·木头人 / 精液·射精（h-ejaculation 对接）
  //   今日首次（h-first-time）/ 时停解放 / 助手 / 监狱 / 女儿 / 访客 / 睡眠装睡（L1.7）
  const pendingFalse = [
    'DR_WOMB_POSITION_INSERT', 'DR_WOMB_POSITION_SEX',
    'EXHIBITIONISM_SEX_MODE_1', 'EXHIBITIONISM_SEX_MODE_2', 'EXHIBITIONISM_SEX_MODE_3', 'EXHIBITIONISM_SEX_MODE_4',
    'GROUP_SEX_MODE_ON',
    'HIDDEN_SEX_MODE_1', 'HIDDEN_SEX_MODE_2', 'HIDDEN_SEX_MODE_3', 'HIDDEN_SEX_MODE_4',
    'T_HIDDEN_SEX_MODE_1_OR_3', 'T_HIDDEN_SEX_MODE_2_OR_4',
    'T_HYPNOSIS_ACTIVE_H', 'T_HYPNOSIS_BLOCKHEAD',
    'T_FIRST_A_SEX_IN_TODAY', 'T_FIRST_SEX_IN_TODAY', 'T_FIRST_U_SEX_IN_TODAY',
    'TARGET_TIME_STOP_ORGASM_RELASE',
    'T_IS_ASSISTANT', 'T_IMPRISONMENT_1', 'TARGET_IS_PLAYER_DAUGHTER', 'TARGET_VISITOR_FLAG_1',
    // 注释：★1 修复（2026-08-11 第七轮）：TARGET_SLEEP_H_AWAKE_BUT_PRETEND_SLEEP 两条
    // **已从 placeholder 列表移除**——真语义由 sleep-system 在 onLoad 注册（语义所有者），
    // 本列表在 onEnable 注册会最后覆盖它（生命周期：全部 onLoad 先行、全部 onEnable 后行）→
    // 装睡/醒来地文 7700+ 条静默死亡（第六轮修复因此无效，第七轮确认并移除）
    'PLACE_SOMEONE_NOT_IN_HIDDEN_AND_CONSCIOUS',
    // 注释：目标精液污染 > 1（erArk Dirty 类型 CVP，hair 地文用）——依赖精液系统（h-ejaculation）落地
    'CVP_A2_DIRTY|B0_G_1',
  ]
  for (const id of pendingFalse) {
    registry.register(id, () => false)
  }
}
