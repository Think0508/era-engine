<script setup lang="ts">
// 注释：秘籍修炼面板（manual-system，2026-09-23）
// 数据全部走 `manual` API（插件不向 UI 暴露内部结构）：listManuals / practice / getConfig / internal.*
// 打开入口：秘籍物品的 effects [{type = "open_manual_panel"}] 或主菜单「秘籍」指令
import { computed, onMounted, ref } from 'vue'
import { apiSystem } from '../../core/api'
import { getEntityAttr } from '../../core/entity-utils'
import { entitySystem } from '../../core/entity-system'
import { useGameStore } from '../stores/game-store'

interface ManualState {
  manual: string
  name: string
  level: number
  cap: number
  maxLayer: number
  nextCost: number
  canPractice: boolean
  reasons: string[]
  heldVolumes: string[]
}

interface InternalSlot {
  used: number
  total: number
  unlimited: boolean
}

const gameStore = useGameStore()

const manuals = ref<ManualState[]>([])
const expAttr = ref('经验')
const exp = ref(0)
const internalSlots = ref<InternalSlot>({ used: 0, total: 1, unlimited: false })
const equipped = ref<string[]>([])
const message = ref('')

const playerId = computed(() => gameStore.player?.id ?? null)

function refresh(): void {
  const id = playerId.value
  if (!id) return
  // 注释：插件未启用（或面板被别处打开）时 callSync 会抛——面板降级为空态而不是白屏
  let cfg: any
  try {
    cfg = apiSystem.callSync('manual', 'getConfig')
  } catch {
    manuals.value = []
    message.value = '秘籍系统未启用'
    return
  }
  expAttr.value = cfg?.exp_attr ?? '经验'
  manuals.value = (apiSystem.callSync('manual', 'listManuals', id) ?? []) as ManualState[]
  internalSlots.value = (apiSystem.callSync('internal', 'slots', id) ?? internalSlots.value) as InternalSlot
  equipped.value = (apiSystem.callSync('internal', 'list', id) ?? []) as string[]
  const ch = entitySystem.get('character', id) as any
  const v = ch ? getEntityAttr(ch, expAttr.value) : 0
  exp.value = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0
}

onMounted(refresh)

async function practiceOne(manualId: string): Promise<void> {
  const id = playerId.value
  if (!id) return
  const r = apiSystem.callSync('manual', 'practice', id, manualId, 1) as any
  message.value = r?.ok ? `修炼成功（第 ${(r.gained ?? 0)} 层）` : `修炼失败：${(r?.reasons ?? []).join('；')}`
  refresh()
}

async function practiceAll(manualId: string): Promise<void> {
  const id = playerId.value
  if (!id) return
  const r = apiSystem.callSync('manual', 'practice', id, manualId, 0) as any
  message.value = r?.ok
    ? `连修 ${r.gained} 层${(r.reasons ?? []).length > 0 ? `（停在：${r.reasons.join('；')}）` : ''}`
    : `无法修炼：${(r?.reasons ?? []).join('；')}`
  refresh()
}
</script>

<template>
  <div class="manual-panel">
    <div class="manual-exp">
      <span class="manual-exp-label">{{ expAttr }}</span>
      <span class="manual-exp-value">{{ exp }}</span>
      <span class="manual-exp-slot">
        内功位 {{ internalSlots.unlimited ? '无限' : `${internalSlots.used}/${internalSlots.total}` }}
      </span>
    </div>

    <div v-if="message" class="manual-message">{{ message }}</div>
    <div v-if="manuals.length === 0" class="manual-empty">尚未持有任何秘籍</div>

    <div v-for="m in manuals" :key="m.manual" class="manual-row">
      <div class="manual-head">
        <span class="manual-name">{{ m.name }}</span>
        <span class="manual-level">{{ m.level }} / {{ m.maxLayer }} 层</span>
      </div>
      <div class="manual-sub">
        <span>可练至 {{ m.cap }} 层</span>
        <span v-if="m.cap > m.level">下一层需 {{ expAttr }} {{ m.nextCost }}</span>
        <span v-else class="manual-dim">已满当前上限</span>
      </div>
      <div class="manual-actions">
        <button class="manual-btn" :disabled="!m.canPractice" @click="practiceOne(m.manual)">修炼一层</button>
        <button class="manual-btn" :disabled="!m.canPractice" @click="practiceAll(m.manual)">连修</button>
      </div>
      <div v-if="m.reasons.length > 0" class="manual-reasons">{{ m.reasons.join('；') }}</div>
      <div v-if="m.heldVolumes.length > 0" class="manual-dim">载体：{{ m.heldVolumes.join('、') }}</div>
    </div>
  </div>
</template>

<style scoped>
.manual-panel {
  display: flex;
  flex-direction: column;
  gap: var(--gap-medium);
}
.manual-exp {
  display: flex;
  align-items: center;
  gap: var(--gap-medium);
  padding: var(--gap-small) var(--gap-medium);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background-color: var(--color-background);
}
.manual-exp-label {
  color: var(--color-text-secondary);
}
.manual-exp-value {
  font-weight: 600;
  color: var(--color-primary);
}
.manual-exp-slot {
  margin-left: auto;
  color: var(--color-text-secondary);
}
.manual-message {
  color: var(--color-success);
}
.manual-empty,
.manual-dim {
  color: var(--color-text-secondary);
}
.manual-row {
  display: flex;
  flex-direction: column;
  gap: var(--gap-small);
  padding: var(--gap-small) var(--gap-medium);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
}
.manual-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.manual-name {
  font-weight: 600;
  color: var(--color-text);
}
.manual-level {
  color: var(--color-primary);
}
.manual-sub {
  display: flex;
  gap: var(--gap-medium);
  color: var(--color-text-secondary);
  font-size: 0.9em;
}
.manual-actions {
  display: flex;
  gap: var(--gap-small);
}
.manual-btn {
  min-height: 44px;
  padding: 0 var(--gap-medium);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  color: var(--color-text);
  cursor: pointer;
}
.manual-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.manual-reasons {
  color: var(--color-warning);
  font-size: 0.9em;
}
</style>
