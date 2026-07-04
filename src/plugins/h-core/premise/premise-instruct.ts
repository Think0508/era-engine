import { entitySystem } from '../../../core/entity-system'

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
}
