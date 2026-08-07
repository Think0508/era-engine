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
  registry.register('TARGET_NOW_SEX_TOY_ON', sexToyLevelGe(1))
  registry.register('TARGET_NOW_SEX_TOY_OFF', (ctx: any) => !sexToyLevelGe(1)(ctx))
  registry.register('TARGET_NOW_SEX_TOY_WEAK', (ctx: any) => {
    const level = (() => {
      const ch = getTarget(ctx)
      if (!ch) return 0
      return ch?.h_state?.sex_toy_level ?? 0
    })()
    return level >= 1 && level <= 3
  })
  registry.register('TARGET_NOW_SEX_TOY_STRONG', sexToyLevelGe(4))
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
}
