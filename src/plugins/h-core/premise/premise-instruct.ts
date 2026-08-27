import { entitySystem } from '../../../core/entity-system'
import { gameContext } from '../../../core/game-context'
import { ATTR } from '../../../core/entity-utils'

function targetId(ctx: any): string | null {
  return ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId ?? null
}

function getTarget(ctx: any): any | null {
  const charId = targetId(ctx)
  if (!charId) return null
  return entitySystem.get('character', charId) as any ?? null
}

// 注释：自己（发起者/玩家）——erArk 无 T_/TARGET_/DR_ 前缀的前提查自己；HAVE_* 背包同理。
// sourceId 优先（NPC 主动指令也能用），回退玩家 id。
function selfId(ctx: any): string | null {
  return ctx?.sourceId ?? ctx?.player?.id ?? ctx?.gameStore?.player?.id ?? ctx?.playerId ?? null
}

function getSelf(ctx: any): any | null {
  const charId = selfId(ctx)
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

  registry.registerPremise('TARGET_HAVE_HORN', haveBodyPart('horn'))
  registry.registerPremise('TARGET_HAVE_TAIL', haveBodyPart('tail'))
  registry.registerPremise('TARGET_HAVE_WING', haveBodyPart('wing'))
  registry.registerPremise('TARGET_HAVE_RING', haveBodyPart('ring'))
  registry.registerPremise('TARGET_HAVE_TENTACLE', haveBodyPart('tentacle'))
  registry.registerPremise('TARGET_HAVE_CAR', haveBodyPart('car'))
  registry.registerPremise('TARGET_HAVE_EARS', haveBodyPart('ears'))

  // ── Technique level checks ─────────────────────────────────
  function abilityLevelGe(abilityId: string, minLevel: number) {
    return (ctx: any) => {
      const ch = getTarget(ctx)
      if (!ch) return false
      return (ch?.abilities?.[abilityId]?.level ?? 0) >= minLevel
    }
  }

  function selfAbilityLevelGe(abilityId: string, minLevel: number) {
    return (ctx: any) => {
      const ch = getSelf(ctx)
      if (!ch) return false
      return (ch?.abilities?.[abilityId]?.level ?? 0) >= minLevel
    }
  }

  registry.registerPremise('TARGET_TECHNIQUE_GE_3', abilityLevelGe(ATTR.TECHNIQUE, 3))
  registry.registerPremise('TARGET_TECHNIQUE_GE_5', abilityLevelGe(ATTR.TECHNIQUE, 5))
  // wait_upon：TARGET_TECHNIQUE_GE_5_OR_IS_UNCONSCIOUS_H（深喉，erArk 原前提）
  registry.registerPremise('TARGET_TECHNIQUE_GE_5_OR_UNCONSCIOUS', (ctx: any) => {
    if (abilityLevelGe(ATTR.TECHNIQUE, 5)(ctx)) return true
    const ch = getTarget(ctx)
    return !!ch?.sp_flag?.unconscious_h
  })
  // 无前缀 = 查自己（erArk handle_premise_ability.py：指技 ability[70] / 腰技 ability[76]）
  registry.registerPremise('FINGER_TECHNIQUE_GE_3', selfAbilityLevelGe('指技', 3))
  registry.registerPremise('FINGER_TECHNIQUE_GE_5', selfAbilityLevelGe('指技', 5))
  registry.registerPremise('WAIST_TECHNIQUE_GE_3', selfAbilityLevelGe('腰技', 3))
  registry.registerPremise('WAIST_TECHNIQUE_GE_4', selfAbilityLevelGe('腰技', 4))
  registry.registerPremise('WAIST_TECHNIQUE_GE_5', selfAbilityLevelGe('腰技', 5))
  registry.registerPremise('WAIST_TECHNIQUE_GE_7', selfAbilityLevelGe('腰技', 7))

  // ── Position / penis state ────────────────────────────────
  // 体位码：h_state.current_sex_position，-1=无，1-12=Sex_Position.csv 体位
  // 读自己体位（erArk DR_*：cache.character_data[0].h_state.current_sex_position）
  function selfPositionEquals(posCode: number | null) {
    return (ctx: any) => {
      const ch = getSelf(ctx)
      if (!ch?.h_state) return posCode === null
      const pos = ch.h_state.current_sex_position ?? -1
      return posCode === null ? pos === -1 : pos === posCode
    }
  }

  const registerPositionPremise = (name: string, posCode: number | null, legacyName?: string): void => {
    const handler = selfPositionEquals(posCode)
    registry.registerPremise(name, handler)
    if (legacyName) registry.registerPremise(legacyName, handler)
  }

  // 新数据用可读名；旧 erArk 名（DR_*）仅作兼容别名
  registerPositionPremise('POSITION_NONE', null, 'DR_POSITION_NULL')
  registerPositionPremise('POSITION_NORMAL', 1, 'DR_POSITION_NORMAL')
  registerPositionPremise('POSITION_BACK', 2, 'DR_POSITION_BACK')
  registerPositionPremise('POSITION_FACE_RIDE', 3, 'DR_POSITION_FACE_RIDE')
  registerPositionPremise('POSITION_BACK_RIDE', 4, 'DR_POSITION_BACK_RIDE')
  registerPositionPremise('POSITION_FACE_SEAT', 5, 'DR_POSITION_FACE_SEAT')
  registerPositionPremise('POSITION_BACK_SEAT', 6, 'DR_POSITION_BACK_SEAT')
  registerPositionPremise('POSITION_FACE_STAND', 7, 'DR_POSITION_FACE_STAND')
  registerPositionPremise('POSITION_BACK_STAND', 8, 'DR_POSITION_BACK_STAND')
  registerPositionPremise('POSITION_FACE_HUG', 9, 'DR_POSITION_FACE_HUG')
  registerPositionPremise('POSITION_BACK_HUG', 10, 'DR_POSITION_BACK_HUG')
  registerPositionPremise('POSITION_FACE_LIE', 11, 'DR_POSITION_FACE_LIE')
  registerPositionPremise('POSITION_BACK_LIE', 12, 'DR_POSITION_BACK_LIE')

  // 自己有任一体位（erArk DR_HAVE_SEX_POSITION = !DR_POSITION_NULL）
  const haveSexPosition = (ctx: any): boolean => {
    const ch = getSelf(ctx)
    if (!ch?.h_state) return false
    return (ch.h_state.current_sex_position ?? -1) !== -1
  }
  registry.registerPremise('HAVE_SEX_POSITION', haveSexPosition)
  registry.registerPremise('DR_HAVE_SEX_POSITION', haveSexPosition)

  // 兼容存量：pull_out_penis 用“自己有体位 或 目标任一处被插入”
  const haveSexPositionOrPenisInTargetAnywhere = (ctx: any): boolean => {
    if (haveSexPosition(ctx)) return true
    const ch = getTarget(ctx)
    const ip = ch?.h_state?.insert_position
    return typeof ip === 'number' && ip >= 0 && ip <= 4
  }
  registry.registerPremise('HAVE_SEX_POSITION_OR_PENIS_IN_TARGET_ANYPART', haveSexPositionOrPenisInTargetAnywhere)
  registry.registerPremise('DR_HAVE_SEX_POSITION_OR_PENIS_IN_T_ANYPART', haveSexPositionOrPenisInTargetAnywhere)

  // ── Insertion state ───────────────────────────────────────
  // 目标插入位（h_state.insert_position）：0=V 1=A 2=U 3=W 4=M（引擎码；erArk body cid 6/8/9/7/5）
  const INSERTION_CODES: Record<string, number[]> = {
    vagina: [0],
    anal: [1],
    womb: [3],
    urethral: [2],
    mouth: [4],
    hair: [5],
    face: [6],
    breast: [7],
    axilla: [8],
    hand: [9],
    leg: [10],
    foot: [11],
    deep_throat: [12],
    vagina_or_womb: [0, 3],
    mouth_or_hand: [4, 9],
    mouth_or_breast: [4, 7],
    mouth_or_deep_throat: [4, 12],
    any: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  }
  function insertionIn(part: string) {
    return (ctx: any) => {
      const ch = getTarget(ctx)
      const ip = ch?.h_state?.insert_position
      return typeof ip === 'number' && (INSERTION_CODES[part] ?? []).includes(ip)
    }
  }

  registry.registerPremise('PENIS_IN_TARGET_VAGINA_OR_WOMB', insertionIn('vagina_or_womb'))
  registry.registerPremise('PENIS_IN_TARGET_ANAL', insertionIn('anal'))
  registry.registerPremise('PENIS_IN_TARGET_WOMB', insertionIn('womb'))
  registry.registerPremise('PENIS_IN_TARGET_URETHRAL', insertionIn('urethral'))
  registry.registerPremise('PENIS_IN_TARGET_MOUTH', insertionIn('mouth'))
  registry.registerPremise('PENIS_NOT_IN_TARGET_MOUTH', (ctx: any) => !insertionIn('mouth')(ctx))
  registry.registerPremise('PENIS_NOT_IN_TARGET_ANAL', (ctx: any) => !insertionIn('anal')(ctx))
  registry.registerPremise('PENIS_NOT_IN_TARGET_VAGINA_OR_WOMB', (ctx: any) => !insertionIn('vagina_or_womb')(ctx))
  registry.registerPremise('PENIS_NOT_IN_TARGET_WOMB', (ctx: any) => !insertionIn('womb')(ctx))
  // wait_upon 侍奉位（erArk insert_position 0/1/2/3/4/5/10/11/15 的引擎码 5-12）
  registry.registerPremise('PENIS_IN_TARGET_HAIR', insertionIn('hair'))
  registry.registerPremise('PENIS_IN_TARGET_FACE', insertionIn('face'))
  registry.registerPremise('PENIS_IN_TARGET_BREAST', insertionIn('breast'))
  registry.registerPremise('PENIS_IN_TARGET_AXILLA', insertionIn('axilla'))
  registry.registerPremise('PENIS_IN_TARGET_HAND', insertionIn('hand'))
  registry.registerPremise('PENIS_IN_TARGET_LEG', insertionIn('leg'))
  registry.registerPremise('PENIS_IN_TARGET_FOOT', insertionIn('foot'))
  registry.registerPremise('PENIS_IN_TARGET_DEEP_THROAT', insertionIn('deep_throat'))
  registry.registerPremise('PENIS_IN_TARGET_MOUTH_OR_HAND', insertionIn('mouth_or_hand'))
  registry.registerPremise('PENIS_IN_TARGET_MOUTH_OR_BREAST', insertionIn('mouth_or_breast'))
  registry.registerPremise('PENIS_IN_TARGET_MOUTH_OR_DEEP_THROAT', insertionIn('mouth_or_deep_throat'))
  // 兼容别名（erArk 原名）
  registry.registerPremise('PENIS_IN_T_VAGINA_OR_WOMB', insertionIn('vagina_or_womb'))
  registry.registerPremise('PENIS_IN_T_ANAL', insertionIn('anal'))
  registry.registerPremise('PENIS_IN_T_WOMB', insertionIn('womb'))
  registry.registerPremise('PENIS_IN_T_URETHRAL', insertionIn('urethral'))
  registry.registerPremise('PENIS_IN_T_MOUSE', insertionIn('mouth'))
  registry.registerPremise('PENIS_NOT_IN_T_MOUSE', (ctx: any) => !insertionIn('mouth')(ctx))
  registry.registerPremise('PENIS_IN_T_HAIR', insertionIn('hair'))
  registry.registerPremise('PENIS_IN_T_FACE', insertionIn('face'))
  registry.registerPremise('PENIS_IN_T_BREAST', insertionIn('breast'))
  registry.registerPremise('PENIS_IN_T_AXILLA', insertionIn('axilla'))
  registry.registerPremise('PENIS_IN_T_HAND', insertionIn('hand'))
  registry.registerPremise('PENIS_IN_T_LEG', insertionIn('leg'))
  registry.registerPremise('PENIS_IN_T_FOOT', insertionIn('foot'))
  registry.registerPremise('PENIS_IN_T_DEEP_THROAT', insertionIn('deep_throat'))
  registry.registerPremise('PENIS_IN_T_MOUSE_OR_HAND', insertionIn('mouth_or_hand'))
  registry.registerPremise('PENIS_IN_T_MOUSE_OR_BREAST', insertionIn('mouth_or_breast'))
  registry.registerPremise('PENIS_IN_T_MOUSE_OR_DEEP_THROAT', insertionIn('mouth_or_deep_throat'))

  // ── Dilate / aperture state ──────────────────────────────
  // TARGET_A_EMPTY：目标后穴无肛门道具——erArk handle_self_a_empty =
  //   无震动棒（body_item[3]）、无拉珠（body_item[7]）、非灌肠（dirty.a_clean ∈ [1,3]）。
  // 注意：不检查 insert_position（“换肛交体位”同时需要 PENIS_IN_TARGET_ANAL + TARGET_ANUS_EMPTY）。
  function anusEmpty(ctx: any): boolean {
    const ch = getTarget(ctx)
    if (!ch) return false
    const hs = ch.h_state ?? {}
    const analToyItemIds = new Set(['震动棒', '肛珠', '灌肠用具', '灌肠液'])
    const hasAnalToy = Object.values(ch.body_items ?? {}).some((sd: any) => sd?.active && analToyItemIds.has(sd?.itemId))
    // 玩具系统落地前的预留字段（h_state 尚未定义时为 undefined = 无）
    const analVibrator = hs.vibrator_insertion_anal === true
    const analBeads = hs.anal_beads === true
    const enema = ch.dirty?.a_clean === 1 || ch.dirty?.a_clean === 3
    return !hasAnalToy && !analVibrator && !analBeads && !enema
  }
  registry.registerPremise('TARGET_ANUS_EMPTY', anusEmpty)
  registry.registerPremise('TARGET_A_EMPTY', anusEmpty)

  // 扩张等级走目标能力（erArk T_W_DILATE_GE_N = target ability[12]（子宫扩张））
  function targetAbilityGe(abilityId: string, minLevel: number) {
    return (ctx: any) => {
      const ch = getTarget(ctx)
      if (!ch) return false
      const abl = ch?.abilities?.[abilityId]
      const lv = typeof abl === 'object' ? (abl?.level ?? 0) : (typeof abl === 'number' ? abl : 0)
      return lv >= minLevel
    }
  }
  registry.registerPremise('TARGET_WOMB_DILATE_GE_3', targetAbilityGe('子宫扩张', 3))
  registry.registerPremise('TARGET_WOMB_DILATE_GE_5', targetAbilityGe('子宫扩张', 5))
  registry.registerPremise('T_W_DILATE_GE_3', targetAbilityGe('子宫扩张', 3))
  registry.registerPremise('T_W_DILATE_GE_5', targetAbilityGe('子宫扩张', 5))
  registry.registerPremise('T_U_DILATE_GE_2', targetAbilityGe('尿道扩张', 2))
  registry.registerPremise('T_U_DILATE_GE_3', targetAbilityGe('尿道扩张', 3))
  registry.registerPremise('T_U_DILATE_GE_5', targetAbilityGe('尿道扩张', 5))

  // 注释：服装前提已由 premise-clothing.ts 注册

  // ── Location / place ─────────────────────────────────────────
  // 注释：位置前提（IN_*）已按架构决策迁移为 location.tags 检查（见 docs/instruction-replication/location-tags.md）
  // 指令 TOML 不再写 IN_* 前提，改用 condition = "location.tags.has_xxx == true"
  // 家具前提保留 location.furniture_count 判断（erArk scene_data.have_furniture：
  //   1=桌椅级 2=办公级 3=床级；指令 CSV 中 PLACE_FURNITURE_3 是 ==3，GE_* 是 >=）
  const locationFurnitureGe = (min: number) => (_ctx: any) => {
    const loc = gameContext.getContext().location
    if (!loc) return false
    return (loc as any).furniture_count >= min
  }
  const locationFurnitureEq = (value: number) => (_ctx: any) => {
    const loc = gameContext.getContext().location
    if (!loc) return false
    return (loc as any).furniture_count === value
  }
  registry.registerPremise('LOCATION_FURNITURE_GE_1', locationFurnitureGe(1))
  registry.registerPremise('LOCATION_FURNITURE_GE_2', locationFurnitureGe(2))
  registry.registerPremise('LOCATION_FURNITURE_GE_3', locationFurnitureGe(3))
  registry.registerPremise('LOCATION_FURNITURE_3', locationFurnitureEq(3))
  // 兼容别名（erArk 原名；仅存量数据引用，新数据用 LOCATION_FURNITURE_*）
  registry.registerPremise('PLACE_FURNITURE_GE_1', locationFurnitureGe(1))
  registry.registerPremise('PLACE_FURNITURE_GE_2', locationFurnitureGe(2))
  registry.registerPremise('PLACE_FURNITURE_GE_3', locationFurnitureGe(3))
  registry.registerPremise('PLACE_DOOR_LOCKABLE', (_ctx: any) => {
    const loc = gameContext.getContext().location
    if (!loc) return false
    return !!(loc as any).door
  })
  registry.registerPremise('PLACE_DOOR_OPEN', (_ctx: any) => {
    const loc = gameContext.getContext().location
    if (!loc) return false
    return (loc as any).door === 'open'
  })
  registry.registerPremise('PLACE_DOOR_CLOSE', (_ctx: any) => {
    const loc = gameContext.getContext().location
    if (!loc) return false
    return (loc as any).door === 'close'
  })
  // sm 批：凌辱室 / 博士房间（IN_HUMILIATION_ROOM_OR_DR_ROOM）→ location.tags
  registry.registerPremise('IN_HUMILIATION_ROOM_OR_DR_ROOM', (_ctx: any) => {
    const tags = gameContext.getContext().location?.tags ?? []
    return tags.includes('has_humiliation_room') || tags.includes('has_dr_room')
  })

  // ── Item possession (inventory) ──────────────────────────────
  // erArk HAVE_* 无 T_ 前缀 = 查自己（有 T_ 前缀才查目标）；背包是数组，不能按 itemId 属性读
  function hasItem(itemId: string) {
    return (ctx: any) => {
      const charId = selfId(ctx)
      if (!charId) return false
      const ch = entitySystem.get('character', charId) as any
      return !!ch?.inventory?.some?.((i: any) => i.itemId === itemId && (i.count ?? 0) > 0)
    }
  }

  function hasAnyItem(itemIds: string[]) {
    return (ctx: any) => {
      const charId = selfId(ctx)
      if (!charId) return false
      const ch = entitySystem.get('character', charId) as any
      return !!ch?.inventory?.some?.((i: any) => itemIds.includes(i.itemId) && (i.count ?? 0) > 0)
    }
  }

  registry.registerPremise('HAVE_BONDAGE', hasItem('绳子'))
  registry.registerPremise('HAVE_VIBRATOR', hasAnyItem(['震动棒', 'V震动棒', 'A震动棒']))
  registry.registerPremise('HAVE_PHILTER', hasItem('媚药'))
  registry.registerPremise('HAVE_CONDOM', hasItem('避孕套'))
  registry.registerPremise('HAVE_BODY_LUBRICANT', hasItem('润滑液'))
  registry.registerPremise('HAVE_PATCH', hasItem('贴片'))
  registry.registerPremise('HAVE_GAG', hasAnyItem(['口枷', '口球']))
  registry.registerPremise('HAVE_WHIP', hasItem('鞭子'))
  registry.registerPremise('HAVE_SAFE_CANDLES', hasItem('安全蜡烛'))
  registry.registerPremise('HAVE_CLYSTER_TOOLS', hasItem('灌肠用具'))
  registry.registerPremise('HAVE_MILKING_MACHINE', hasItem('挤奶机'))
  registry.registerPremise('HAVE_URINE_COLLECTOR', hasItem('集尿器'))
  registry.registerPremise('HAVE_COTTON_STICK', hasItem('棉棒'))
  registry.registerPremise('HAVE_LOVE_EGG', hasItem('跳蛋'))
  registry.registerPremise('HAVE_ELECTRIC_MESSAGE_STICK', hasItem('电动按摩棒'))
  registry.registerPremise('HAVE_NIPPLE_CLAMP', hasItem('乳头夹'))
  registry.registerPremise('HAVE_CLIT_CLAMP', hasItem('阴蒂夹'))
  registry.registerPremise('HAVE_ANAL_BEADS', hasAnyItem(['肛珠', '肛门拉珠']))
  registry.registerPremise('HAVE_ENEMAS', hasItem('灌肠液'))
  registry.registerPremise('HAVE_SLEEPING_PILLS', hasItem('安眠药'))
  registry.registerPremise('HAVE_DIURETICS_ONCE', hasItem('利尿剂瞬间'))
  registry.registerPremise('HAVE_DIURETICS_PERSISTENT', hasItem('利尿剂持续'))
  registry.registerPremise('HAVE_CLOMID', hasItem('排卵促进药'))
  registry.registerPremise('HAVE_BIRTH_CONTROL_PILLS_BEFORE', hasItem('事前避孕药'))
  registry.registerPremise('HAVE_BIRTH_CONTROL_PILLS_AFTER', hasItem('事后避孕药'))

  // ── Misc flags / state ──────────────────────────────────────
  registry.registerPremise('T_LACTATION_1', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !!ch?.sp_flag?.lactation
  })
  registry.registerPremise('T_INFLATION_1', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !!ch?.h_state?.inflation
  })
  registry.registerPremise('T_CHILD_OR_LOLI_1', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    const age = ch?.base?.age ?? ch?.base?.['年龄'] ?? 99
    return age <= 14
  })
  registry.registerPremise('T_MILK_GE_30', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return (ch?.base?.泌乳量 ?? 0) >= 30
  })
  registry.registerPremise('T_URINATE_GE_80', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return (ch?.base?.憋尿 ?? 0) >= 80
  })
  registry.registerPremise('NOW_CONDOM', (ctx: any) => {
    const ch = getSelf(ctx)
    if (!ch) return false
    // erArk body_item[13][1]；h_state.condom 仅兼容镜像
    return ch?.h_state?.condom === true || ch?.body_items?.['13']?.active === true
  })
  registry.registerPremise('NOW_NOT_CONDOM', (ctx: any) => {
    const ch = getSelf(ctx)
    if (!ch) return false
    return ch?.h_state?.condom !== true && ch?.body_items?.['13']?.active !== true
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
  registry.registerPremise('TARGET_NOW_SEX_TOY_ON', sexToyLevelGe(1))
  registry.registerPremise('TARGET_NOW_SEX_TOY_OFF', (ctx: any) => !sexToyLevelGe(1)(ctx))
  registry.registerPremise('TARGET_NOW_SEX_TOY_WEAK', sexToyLevelEq(1))
  registry.registerPremise('TARGET_NOW_SEX_TOY_MIDDLE', sexToyLevelEq(2))
  registry.registerPremise('TARGET_NOW_SEX_TOY_STRONG', sexToyLevelEq(3))
  registry.registerPremise('TARGET_NOT_VIBRATOR_INSERTION', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !ch?.h_state?.vibrator_insertion
  })
  registry.registerPremise('TARGET_NOW_VIBRATOR_INSERTION', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !!ch?.h_state?.vibrator_insertion
  })
  registry.registerPremise('TARGET_NOT_VIBRATOR_INSERTION_ANAL', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !ch?.h_state?.vibrator_insertion_anal
  })
  registry.registerPremise('TARGET_NOW_VIBRATOR_INSERTION_ANAL', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !!ch?.h_state?.vibrator_insertion_anal
  })
  registry.registerPremise('TARGET_NOT_NIPPLE_CLAMP', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !ch?.h_state?.nipple_clamp
  })
  registry.registerPremise('TARGET_NOW_NIPPLE_CLAMP', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !!ch?.h_state?.nipple_clamp
  })
  registry.registerPremise('TARGET_NOT_CLIT_CLAMP', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !ch?.h_state?.clit_clamp
  })
  registry.registerPremise('TARGET_NOW_CLIT_CLAMP', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !!ch?.h_state?.clit_clamp
  })
  registry.registerPremise('TARGET_NOT_ANAL_BEADS', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !ch?.h_state?.anal_beads
  })
  registry.registerPremise('TARGET_NOW_ANAL_BEADS', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !!ch?.h_state?.anal_beads
  })
  registry.registerPremise('TARGET_NOT_MILKING_MACHINE', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !ch?.h_state?.milking_machine
  })
  registry.registerPremise('TARGET_NOW_MILKING_MACHINE', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !!ch?.h_state?.milking_machine
  })
  registry.registerPremise('TARGET_NOW_SEX_TOY_NOT_STRONG', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return (ch?.h_state?.sex_toy_level ?? 0) !== 3
  })
  // 遥控玩具前提：身上有任一玩具（h_state 标志或 body_item 活跃）
  registry.registerPremise('TARGET_HAVE_SEX_TOY', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    const hs = ch.h_state ?? {}
    if (hs.sex_toy_level > 0 || hs.vibrator_insertion || hs.vibrator_insertion_anal || hs.nipple_clamp || hs.clit_clamp || hs.anal_beads) return true
    return Object.values(ch.body_items ?? {}).some((sd: any) => sd?.active)
  })
  registry.registerPremise('T_NOT_ENEMA', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !ch?.h_state?.enema
  })
  registry.registerPremise('T_ENEMA', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return !!ch?.h_state?.enema
  })
  registry.registerPremise('T_ENEMA_CAPACITY_L_5', (ctx: any) => {
    const ch = getTarget(ctx)
    if (!ch) return false
    return (ch?.h_state?.enema_capacity ?? 0) < 5
  })
  // ⚠️ 半成品（2026-08-13 审计标注）：DEBUG_MODE_ON/OFF——调试模式开关
  // （erArk handle_premise_sp_flag.py debug_mode 相关）——调试模式未实装，恒 false/true 占位
  registry.registerPremise('DEBUG_MODE_ON', () => false)
  registry.registerPremise('DEBUG_MODE_OFF', () => true)

  // ═══════════════════════════════════════════════════════════════
  // T2：talk-common 迁移数据引用的 erArk 前提（2026-08-08 全量扫描补齐）
  // 原则：数据可判的注册真实语义；依赖未实装系统的注册恒 false + TODO 注释
  // （情境不存在 → 地文不可达是正确的；系统落地时补语义，校验测试持续盯防新增未注册前提）
  // ═══════════════════════════════════════════════════════════════

  // ── 无意识系列（unconscious_h 数据存在：时停=3、催眠=4-7、睡眠=1 待 L1.7）──
  // erArk handle_premise_sp_flag.py:1804/1834 等：t_unconscious_flag = 任意无意识；
  // t_unconscious_flag_N = unconscious_h === N
  registry.registerPremise('T_UNCONSCIOUS_FLAG', (ctx: any) => {
    const ch = getTarget(ctx)
    return !!ch?.sp_flag?.unconscious_h
  })
  for (let n = 1; n <= 6; n++) {
    const level = n
    registry.registerPremise(`T_UNCONSCIOUS_FLAG_${level}`, (ctx: any) => {
      const ch = getTarget(ctx)
      return ch?.sp_flag?.unconscious_h === level
    })
  }

  // ── 位置类（location.tags 可判）──
  registry.registerPremise('H_IN_BATHROOM', (_ctx: any) => {
    const tags = gameContext.getContext().location?.tags ?? []
    return tags.includes('has_bathroom')
  })
  registry.registerPremise('H_IN_LOVE_HOTEL', (_ctx: any) => {
    const tags = gameContext.getContext().location?.tags ?? []
    return tags.includes('has_love_hotel')
  })

  // ── 宝珠等级（宝珠系统未实装 → 无宝珠 = 等级 0）──
  registry.registerPremise('JJ_0', () => true)
  for (let n = 1; n <= 3; n++) {
    registry.registerPremise(`JJ_${n}`, () => false)  // TODO 宝珠系统未实装
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
    return (p?.base?.[ATTR.SEMEN] ?? 0) + (p?.base?.[ATTR.EXTRA_SEMEN] ?? 0)
  }
  registry.registerPremise('PL_EJA_POINT_LOW_OR_MIDDLE', () => {
    const p = getPlayerChar()
    return (p?.base?.[ATTR.EJA_GAUGE] ?? 0) <= 600
  })
  registry.registerPremise('PL_EJA_POINT_HIGH_OR_EXTREME', () => {
    const p = getPlayerChar()
    // 注释：>600 是"高或极"的意图语义（低中=≤600 的互补分区）。
    // erArk 字面实现有 bug：HIGH 只查上界 ≤900（覆盖全区间）→ HIGH_OR_EXTREME 恒 true；
    // 我们取意图语义（对齐项目修复 erArk 死代码的既有先例），数值 600 可追溯 MIDDLE 阈值
    return (p?.base?.[ATTR.EJA_GAUGE] ?? 0) > 600
  })
  registry.registerPremise('PL_SEMEN_LE_2', () => plSemenTotal() <= 2)
  registry.registerPremise('PL_SEMEN_G_2', () => plSemenTotal() > 2)
  registry.registerPremise('PL_SEMEN_L_100', () => plSemenTotal() < 100)
  registry.registerPremise('PL_SEMEN_GE_100', () => plSemenTotal() >= 100)
  registry.registerPremise('PL_PENIS_NOT_SEMEN_DIRTY', () => {
    const p = getPlayerChar()
    return !p?.dirty?.penis_dirty_dict?.semen
  })
  registry.registerPremise('PL_PENIS_SEMEN_DIRTY', () => {
    const p = getPlayerChar()
    return !!p?.dirty?.penis_dirty_dict?.semen
  })

  // ── 逆推前提（erArk handle_premise_H.py:2031-2044）──
  // 2026-08-11：从恒 false 占位升级为真语义（h-npc-ai 插件消费；npc_active_h 属 h_state
  // 类型域 = h-core；逆推中普通 H 指令因 T_NPC_NOT_ACTIVE_H 失败而隐藏，keep_enjoy 等
  // 逆推专属指令因 T_NPC_ACTIVE_H 通过——erArk 同款前提过滤隐藏制）
  const npcActive = (char: any): boolean =>
    char?.h_state?.npc_active_h === true || char?.hypnosis?.active_h === true
  registry.registerPremise('T_NPC_ACTIVE_H', (ctx: any) => {
    const id = targetId(ctx)
    if (!id) return false
    return npcActive(entitySystem.get('character', id))
  })
  registry.registerPremise('T_NPC_NOT_ACTIVE_H', (ctx: any) => {
    const id = targetId(ctx)
    if (!id) return false
    return !npcActive(entitySystem.get('character', id))
  })
  registry.registerPremise('NPC_ACTIVE_H', (ctx: any) => {
    const id = ctx?.sourceId
    if (!id) return false
    return npcActive(entitySystem.get('character', id))
  })

  // ── 依赖未实装系统 → 恒 false（情境不存在，地文不可达）──
  // TODO 各系统落地时补语义（校验测试会盯防新未注册前提）：
  //   子宫体位（B3）/ 隐奸 / 群交 / 逆推 / 催眠逆推·木头人 / 精液·射精（h-ejaculation 对接）
  //   今日首次（h-first-time）/ 时停解放 / 助手 / 监狱 / 女儿 / 访客 / 睡眠装睡（L1.7）
  // ★1 修复（confinement 落地 2026-08-14）：T_IMPRISONMENT_1 **已从 placeholder 列表移除**——
  //   真语义由 confinement-system 在 onLoad 注册（语义所有者），本列表在 onEnable 注册会
  //   最后覆盖它（生命周期：全部 onLoad 先行、全部 onEnable 后行）——与
  //   TARGET_SLEEP_H_AWAKE_BUT_PRETEND_SLEEP 同款处理（第七轮修复）
  // 2026-08-15：EXHIBITIONISM_SEX_MODE_1~4 已从列表移除——露出系统落地，
  //   真语义由 h-exposure 注册（语义所有者；同 T_IMPRISONMENT_1 先例）
  const pendingFalse = [
    'DR_WOMB_POSITION_INSERT', 'DR_WOMB_POSITION_SEX',
    'GROUP_SEX_MODE_ON',
    'HIDDEN_SEX_MODE_1', 'HIDDEN_SEX_MODE_2', 'HIDDEN_SEX_MODE_3', 'HIDDEN_SEX_MODE_4',
    'T_HIDDEN_SEX_MODE_1_OR_3', 'T_HIDDEN_SEX_MODE_2_OR_4',
    'T_HYPNOSIS_ACTIVE_H', 'T_HYPNOSIS_BLOCKHEAD',
    'T_FIRST_A_SEX_IN_TODAY', 'T_FIRST_SEX_IN_TODAY', 'T_FIRST_U_SEX_IN_TODAY',
    'TARGET_TIME_STOP_ORGASM_RELASE',
    'T_IS_ASSISTANT', 'TARGET_IS_PLAYER_DAUGHTER', 'TARGET_VISITOR_FLAG_1',
    // 注释：★1 修复（2026-08-11 第七轮）：TARGET_SLEEP_H_AWAKE_BUT_PRETEND_SLEEP 两条
    // **已从 placeholder 列表移除**——真语义由 sleep-system 在 onLoad 注册（语义所有者），
    // 本列表在 onEnable 注册会最后覆盖它（生命周期：全部 onLoad 先行、全部 onEnable 后行）→
    // 装睡/醒来地文 7700+ 条静默死亡（第六轮修复因此无效，第七轮确认并移除）
    'PLACE_SOMEONE_NOT_IN_HIDDEN_AND_CONSCIOUS',
    // 注释：目标精液污染 > 1（erArk Dirty 类型 CVP，hair 地文用）——依赖精液系统（h-ejaculation）落地
    'CVP_A2_DIRTY|B0_G_1',
  ]
  for (const id of pendingFalse) {
    registry.registerPremise(id, () => false)
  }
}
