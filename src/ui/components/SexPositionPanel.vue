<script setup lang="ts">
// 注释：性交体位面板（2026-08-26 insert 批次）
// 打开入口：指令效果 open_sex_position_panel → engine-ui-bridge → uiStore.sexPositionPanel + activePanel
// 面板选择 = erArk sex_position_panel.select_sex_position 的等价物：
//   列出可用体位（家具/腰技过滤）→ 选择后直接执行对应体位指令（内嵌 judge/效果链），
//   并绕开“当前体位/已插入/家具”这类面板已替代的状态前提（erArk 面板同样只列可用项后直接结算）。
import { ref, computed, onMounted } from 'vue'
import { useUIStore } from '../stores/ui-store'
import { useGameStore } from '../stores/game-store'
import { commandExecutor } from '../../core/command-executor'
import { apiSystem } from '../../core/api'
import { entitySystem } from '../../core/entity-system'
import { gameContext } from '../../core/game-context'
import { createCommandEvaluators } from '../utils/command-eval'

interface SexPositionItem {
  id: number
  name: string
  furniture_req: number
  skill_req: number
  stamina_cost: number
  pleasure_coefficient: number
  available: boolean
  current: boolean
}

const uiStore = useUIStore()
const gameStore = useGameStore()

const positions = ref<SexPositionItem[]>([])
const loading = ref(true)
const error = ref('')

const context = computed(() => uiStore.sexPositionPanel ?? { sexType: 1, change: false })

// 体位 ID（1-12）→ [sexType: 1=V 2=宫颈 3=子宫 4=A] 的指令 id（与 InstructConfig 一致）
const POSITION_COMMAND_IDS: Record<number, Record<number, string>> = {
  1: { 1: 'normal_sex', 2: 'normal_cervix_sex', 3: 'normal_womb_sex', 4: 'normal_anal_sex' },
  2: { 1: 'back_sex', 2: 'back_cervix_sex', 3: 'back_womb_sex', 4: 'back_anal_sex' },
  3: { 1: 'riding_sex', 2: 'riding_cervix_sex', 3: 'riding_womb_sex', 4: 'riding_anal_sex' },
  4: { 1: 'back_riding_sex', 2: 'back_riding_cervix_sex', 3: 'back_riding_womb_sex', 4: 'back_riding_anal_sex' },
  5: { 1: 'face_seat_sex', 2: 'face_seat_cervix_sex', 3: 'face_seat_womb_sex', 4: 'face_seat_anal_sex' },
  6: { 1: 'back_seat_sex', 2: 'back_seat_cervix_sex', 3: 'back_seat_womb_sex', 4: 'back_seat_anal_sex' },
  7: { 1: 'face_stand_sex', 2: 'face_stand_cervix_sex', 3: 'face_stand_womb_sex', 4: 'face_stand_anal_sex' },
  8: { 1: 'back_stand_sex', 2: 'back_stand_cervix_sex', 3: 'back_stand_womb_sex', 4: 'back_stand_anal_sex' },
  9: { 1: 'face_hug_sex', 2: 'face_hug_cervix_sex', 3: 'face_hug_womb_sex', 4: 'face_hug_anal_sex' },
  10: { 1: 'back_hug_sex', 2: 'back_hug_cervix_sex', 3: 'back_hug_womb_sex', 4: 'back_hug_anal_sex' },
  11: { 1: 'face_lay_sex', 2: 'face_lay_cervix_sex', 3: 'face_lay_womb_sex', 4: 'face_lay_anal_sex' },
  12: { 1: 'back_lay_sex', 2: 'back_lay_cervix_sex', 3: 'back_lay_womb_sex', 4: 'back_lay_anal_sex' },
}

onMounted(async () => {
  try {
    const list = await apiSystem.call('h-core', 'getAvailableSexPositions', context.value.sexType)
    positions.value = (list ?? []) as SexPositionItem[]
  } catch (e) {
    error.value = String(e)
  } finally {
    loading.value = false
  }
})

function closePanel() {
  uiStore.setActivePanel(null)
  uiStore.sexPositionPanel = null
}

// 面板选择 = 直接执行对应体位指令。绕开面板已替代的状态前提：
//   体位/是否已插入/家具/后穴空/扩张——这些在 erArk 由面板交互或指令前提承担，选择后直接结算。
const BYPASS_PATTERN = /^(POSITION_|HAVE_SEX_POSITION|DR_POSITION_|PENIS_IN_|TARGET_ANUS_EMPTY|TARGET_A_EMPTY|LOCATION_FURNITURE_|PLACE_FURNITURE_|T_W_DILATE_|TARGET_WOMB_DILATE_)/i

async function selectPosition(positionId: number) {
  const cmdId = POSITION_COMMAND_IDS[positionId]?.[context.value.sexType]
  if (!cmdId) {
    error.value = `该体位指令尚未复刻（position=${positionId}, sexType=${context.value.sexType}）`
    return
  }
  const player = gameStore.player as any
  const evaluators = createCommandEvaluators({ uiStore, gameStore })
  const laxEvaluatePremises = (premises: string[]): boolean => {
    const real = premises.filter((p) => !BYPASS_PATTERN.test(p))
    if (real.length > 0 && !evaluators.evaluatePremises(real)) return false
    return true
  }
  try {
    await commandExecutor.execute(cmdId, {
      uiStore,
      gameStore,
      api: apiSystem,
      engine: gameContext,
      ...evaluators,
      evaluatePremises: laxEvaluatePremises,
      sourceId: player?.id ?? null,
    })
  } finally {
    closePanel()
  }
  // 与 CommandBar 一致：执行后推入输出模式并刷新玩家/角色列表
  if (gameStore.narrativeLogEntries.length > 0) {
    gameStore.pushMode('output')
  }
  const playerId = (gameStore.player as any)?.id
  if (playerId) {
    const fresh = entitySystem.get('character', playerId) as any
    if (fresh) gameStore.setPlayer({ ...fresh })
  }
  const loc = gameStore.location as any
  if (loc?.id) {
    const freshChars: any[] = []
    for (const char of entitySystem.getAll('character')) {
      if ((char as any).current_location === loc.id) freshChars.push(char)
    }
    gameStore.setCharactersAtLocation(freshChars)
  }
}

const staminaLabel = (v: number): string => (v === 1 ? '小' : v === 2 ? '中' : '大')
</script>

<template>
  <div class="sex-position-panel">
    <div class="panel-heading">
      <span>{{ context.change ? '切换性交体位' : '选择性交体位' }}</span>
      <span v-if="error" class="panel-error">{{ error }}</span>
    </div>
    <div v-if="loading" class="panel-tip">读取体位中…</div>
    <div v-else class="position-grid">
      <button
        v-for="pos in positions"
        :key="pos.id"
        class="position-button"
        :class="{
          'position-current': pos.current,
          'position-disabled': !pos.available,
        }"
        :disabled="!pos.available"
        @click="selectPosition(pos.id)"
      >
        <span class="position-name">{{ pos.name }}</span>
        <span class="position-meta">
          {{ pos.current ? '（当前）' : '' }}
        </span>
        <span v-if="!pos.available" class="position-requirement">
          需要{{ pos.furniture_req > 0 ? `家具≥${pos.furniture_req} ` : '' }}<template v-if="pos.skill_req > 0">腰技≥{{ pos.skill_req }} </template>（体力消耗{{ staminaLabel(pos.stamina_cost) }}）
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.sex-position-panel {
  display: flex;
  flex-direction: column;
  gap: var(--gap-medium);
}
.panel-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.panel-error {
  color: var(--color-danger);
}
.panel-tip {
  color: var(--color-text-secondary);
}
.position-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--gap-small);
}
.position-button {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--gap-small) var(--gap-medium);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
}
.position-button:hover:not(:disabled) {
  border-color: var(--color-primary);
}
.position-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.position-current {
  border-color: var(--color-primary);
}
.position-name {
  font-weight: 600;
}
.position-meta,
.position-requirement {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}
</style>