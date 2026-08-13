// 注释：SavePanel 存档面板（对齐 erArk 神经连接柜 SeeSaveListPanel）
// 交互：auto 槽置顶（存在可点；空则纯文本）+ 分页数字槽列表
// 槽位行：No.{id} {版本} 游戏时间:{年}年{季节|月}月{日}日{时}点{分}分 存档时间:{YYYY-MM-DD HH:MM} {角色名}{后缀} (新!)
// 空槽点击直接存（无确认）；已存在槽 → 操作菜单（读取/覆盖/删除/导出/返回），全部二次确认
// writeSave=false（标题读档）：无覆盖、auto 槽只读、空槽不可点（erArk write_save 语义）
// 导入：文件选择器 → 校验 modId → 分配空数字槽；导出：下载 JSON 文件
// 保存成功后（数字槽）→ 更新 save-memory（lastSavePage/lastSaveId）

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useUIStore } from '../stores/ui-store'
import { getUIText } from '../../core/ui-text'
import { SAVE_CONFIG } from '../../core/save-system'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps<{
  writeSave?: boolean
}>()

const emit = defineEmits<{
  (e: 'loaded'): void
  (e: 'back'): void
}>()

const uiStore = useUIStore()

// 注释：槽位头部缓存（head-only 读取，对齐 erArk 头/数据分离）
const heads = ref<Record<string, any>>({})
const autoHead = ref<any>(null)
const page = ref(0)
const totalPages = computed(() => Math.max(1, Math.ceil(SAVE_CONFIG.maxSave / SAVE_CONFIG.savePage)))
const loading = ref(true)
const message = ref('')
const isError = ref(false)

// 注释：操作菜单/确认对话框状态
const selectedSlot = ref<string | null>(null)
const confirmAction = ref<{ kind: 'load' | 'overwrite' | 'delete'; slotId: string } | null>(null)
const busy = ref(false)

const u = (key: string): string => getUIText(key)

const t = (s: string | undefined): string => u('save.label.character') ? `${s ?? ''}${u('save.label.character')}` : (s ?? '')

// 注释：季节显示（erArk 3/6/9/12 月 → 春夏秋冬；其他月份显示数字）
const SEASON_MONTHS: Record<number, string> = { 3: '春', 6: '夏', 9: '秋', 12: '冬' }

function formatGameTime(gt: any): string {
  if (!gt) return ''
  const monthText = SEASON_MONTHS[gt.month] ?? `${gt.month}`
  return `${gt.year}年${monthText}月${gt.day}日${gt.hour}点${String(gt.minute).padStart(2, '0')}分`
}

function formatSaveTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 注释：当前页槽位列表（0..maxSave-1，分页切片）
const pageSlots = computed(() => {
  const start = page.value * SAVE_CONFIG.savePage
  const end = Math.min(start + SAVE_CONFIG.savePage, SAVE_CONFIG.maxSave)
  const list: { slotId: string; head: any }[] = []
  for (let i = start; i < end; i++) {
    list.push({ slotId: String(i), head: heads.value[String(i)] ?? null })
  }
  return list
})

async function refreshSlots(): Promise<void> {
  const { getSaveSlots, getSaveMemory } = await import('../../core/save-system')
  const slots = await getSaveSlots()
  const map: Record<string, any> = {}
  for (const s of slots) {
    map[s.slotId] = s
  }
  heads.value = map
  autoHead.value = map['auto'] ?? null
  // 注释：恢复上次页码（对齐 erArk last_save_page）+ 最新存档标记
  const mem = getSaveMemory()
  memLastSaveId.value = mem.lastSaveId
  const memPage = Math.floor(mem.lastSavePage)
  if (memPage >= 0 && memPage < totalPages.value) {
    page.value = memPage
  }
}

onMounted(() => {
  refreshSlots()
    .catch((e: any) => {
      // 注释：IndexedDB 异常等极端情况——显示错误而非静默/未捕获 rejection
      showMsg(`存档读取失败：${e?.message ?? e}`, true)
    })
    .finally(() => { loading.value = false })
})

function showMsg(text: string, error = false): void {
  message.value = text
  isError.value = error
  setTimeout(() => { message.value = '' }, 3000)
}

// 注释：槽位行文本（对齐 erArk SaveInfoDraw 格式）
function slotLine(slotId: string, head: any): string {
  if (!head) return `${slotId === 'auto' ? 'auto' : slotId}. ${u('save.empty_slot')}`
  const isNew = slotId === 'auto' ? '' : (memLastSaveId.value === slotId ? u('save.label.is_new') : '')
  return `No.${slotId} ${head.modVersion} ${u('save.label.game_time')}${formatGameTime(head.gameTime)} ${u('save.label.save_time')}${formatSaveTime(head.saveTime)} ${t(head.characterName)}${isNew}`
}

// 注释：上次保存的槽位（(新!) 标记，对齐 erArk get_last_save_id）
const memLastSaveId = ref('')

// 注释：保存到槽位（空槽点击直接存 / 覆盖确认后存）
async function doSave(slotId: string): Promise<void> {
  busy.value = true
  try {
    const { saveGame, getSaveMemory, setSaveMemory } = await import('../../core/save-system')
    await saveGame(slotId, uiStore.toSaveData(), `存档 ${slotId}`)
    // 注释：数字槽保存 → 更新界面记忆（对齐 erArk set_last_save_page/set_last_save_id）
    const mem = getSaveMemory()
    const nextPage = Math.floor(Number(slotId) / SAVE_CONFIG.savePage)
    setSaveMemory({ lastSavePage: Number.isFinite(nextPage) ? nextPage : mem.lastSavePage, lastSaveId: slotId })
    memLastSaveId.value = slotId
    showMsg(`存档成功：槽位 ${slotId}`)
    await refreshSlots()
  } catch (e: any) {
    showMsg(`存档失败：${e?.message ?? e}`, true)
  } finally {
    busy.value = false
  }
}

// 注释：读档（loadGame → 迁移 → restore → uiState 恢复 → 通知父级）
async function doLoad(slotId: string): Promise<void> {
  busy.value = true
  try {
    const { loadAndRestoreSave } = await import('../../core/save-system')
    const data = await loadAndRestoreSave(slotId)
    if (!data) {
      showMsg(`读档失败：槽位 ${slotId} 不存在`, true)
      return
    }
    uiStore.fromSaveData(data.uiState as any)
    emit('loaded')
  } catch (e: any) {
    showMsg(`读档失败：${e?.message ?? e}`, true)
  } finally {
    busy.value = false
  }
}

// 注释：删除存档
async function doDelete(slotId: string): Promise<void> {
  busy.value = true
  try {
    const { deleteSave } = await import('../../core/save-system')
    await deleteSave(slotId)
    showMsg(`已删除槽位 ${slotId}`)
    await refreshSlots()
  } catch (e: any) {
    showMsg(`删除失败：${e?.message ?? e}`, true)
  } finally {
    busy.value = false
  }
}

// 注释：导出存档（下载 JSON 文件）
async function doExport(slotId: string): Promise<void> {
  try {
    const { exportSave } = await import('../../core/save-system')
    const json = await exportSave(slotId)
    if (!json) {
      showMsg(`导出失败：槽位 ${slotId} 不存在`, true)
      return
    }
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const dateStr = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `erark-save-${slotId}-${dateStr}.json`
    a.click()
    URL.revokeObjectURL(url)
    showMsg(`已导出槽位 ${slotId}`)
  } catch (e: any) {
    showMsg(`导出失败：${e?.message ?? e}`, true)
  }
}

// 注释：导入存档（文件选择 → 校验 → 空槽分配）
const fileInput = ref<HTMLInputElement | null>(null)

async function doImport(file: File): Promise<void> {
  busy.value = true
  try {
    const text = await file.text()
    const { importSave } = await import('../../core/save-system')
    const slotId = await importSave(text)
    showMsg(`导入成功：槽位 ${slotId}`)
    await refreshSlots()
  } catch (e: any) {
    showMsg(`导入失败：${e?.message ?? e}`, true)
  } finally {
    busy.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

// 注释：槽位点击——空槽直接存（writeSave 模式）；已存在槽打开操作菜单
function onSlotClick(slotId: string, head: any): void {
  if (busy.value) return
  if (!head) {
    if (props.writeSave !== false) {
      doSave(slotId)
    }
    return
  }
  selectedSlot.value = slotId
}

// 注释：auto 槽点击——存在时打开操作菜单（两种模式均可点；auto 槽永不可覆盖，对齐 erArk）
function onAutoClick(): void {
  if (busy.value) return
  if (!autoHead.value) return
  selectedSlot.value = 'auto'
}

function onBack(): void {
  selectedSlot.value = null
}

function confirmSelected(kind: 'load' | 'overwrite' | 'delete'): void {
  if (!selectedSlot.value) return
  confirmAction.value = { kind, slotId: selectedSlot.value }
}

function onConfirm(): void {
  const action = confirmAction.value
  if (!action) return
  confirmAction.value = null
  selectedSlot.value = null
  if (action.kind === 'load') doLoad(action.slotId)
  else if (action.kind === 'overwrite') doSave(action.slotId)
  else doDelete(action.slotId)
}

function onCancelConfirm(): void {
  confirmAction.value = null
}

const confirmText = computed(() => {
  if (!confirmAction.value) return ''
  const kind = confirmAction.value.kind
  const label = u(kind === 'load' ? 'save.confirm.load' : kind === 'overwrite' ? 'save.confirm.overwrite' : 'save.confirm.delete')
  return `${label}（槽位 ${confirmAction.value.slotId}）`
})

const confirmBtn = computed(() => {
  if (!confirmAction.value) return ''
  return u(confirmAction.value.kind === 'load' ? 'save.action.load' : confirmAction.value.kind === 'overwrite' ? 'save.action.overwrite' : 'save.action.delete')
})

function prevPage(): void {
  if (page.value > 0) {
    page.value--
    selectedSlot.value = null
  }
}

function nextPage(): void {
  if (page.value < totalPages.value - 1) {
    page.value++
    selectedSlot.value = null
  }
}

// 注释：操作菜单内容（erArk：读取/覆盖(写模式)/删除/返回；导出为本项目扩展；
// auto 槽永不含覆盖——对齐 erArk auto 槽 write_save 恒 0）
const actionMenu = computed(() => {
  if (!selectedSlot.value) return []
  const slotId = selectedSlot.value
  const isAuto = slotId === 'auto'
  const items: { id: string; label: string; action: () => void }[] = [
    { id: 'load', label: u('save.action.load'), action: () => confirmSelected('load') },
  ]
  if (props.writeSave !== false && !isAuto) {
    items.push({ id: 'overwrite', label: u('save.action.overwrite'), action: () => confirmSelected('overwrite') })
  }
  items.push({ id: 'delete', label: u('save.action.delete'), action: () => confirmSelected('delete') })
  // 注释：导出仅对数字槽（auto 槽为会话自动档，无需导出）
  if (!isAuto) {
    items.push({ id: 'export', label: u('save.export'), action: () => { doExport(slotId); selectedSlot.value = null } })
  }
  items.push({ id: 'back', label: u('save.action.back'), action: onBack })
  return items
})
</script>

<template>
  <div class="save-panel">
    <h3 class="panel-title">{{ u('save.panel_title') }}</h3>

    <div v-if="loading" class="panel-hint">{{ u('save.loading') }}</div>

    <div v-else class="save-body">
      <!-- 注释：auto 槽置顶（erArk：存在可点 → 读取/删除；空则纯文本；永不可覆盖） -->
      <div
        class="save-slot auto-slot"
        :class="{ clickable: !!autoHead }"
        @click="onAutoClick"
      >
        <span class="slot-line">{{ slotLine('auto', autoHead) }}</span>
        <span v-if="autoHead" class="slot-flag">{{ u('save.label.auto') }}</span>
      </div>

      <!-- 注释：数字槽列表 -->
      <div
        v-for="s in pageSlots"
        :key="s.slotId"
        class="save-slot"
        :class="{ clickable: s.head || writeSave !== false, empty: !s.head }"
        @click="onSlotClick(s.slotId, s.head)"
      >
        <span class="slot-line">{{ slotLine(s.slotId, s.head) }}</span>
      </div>

      <!-- 注释：分页 -->
      <div class="pagination">
        <button class="page-button" :disabled="page <= 0" @click="prevPage">{{ u('save.page_prev') }}</button>
        <span class="page-info">{{ page + 1 }} / {{ totalPages }}</span>
        <button class="page-button" :disabled="page >= totalPages - 1" @click="nextPage">{{ u('save.page_next') }}</button>
      </div>

      <!-- 注释：导入（本插件扩展——浏览器备份/迁移能力） -->
      <div class="panel-tools">
        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          class="file-input"
          @change="(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) doImport(f) }"
        />
      </div>

      <!-- 注释：消息条 -->
      <p v-if="message" class="panel-message" :class="{ error: isError }">{{ message }}</p>
    </div>

    <!-- 注释：操作菜单（已存在槽点击后弹出，erArk draw_save_handle 语义） -->
    <div v-if="selectedSlot" class="action-menu">
      <button
        v-for="item in actionMenu"
        :key="item.id"
        class="action-button"
        :class="{ primary: item.id === 'load' }"
        @click="item.action()"
      >
        {{ item.label }}
      </button>
    </div>

    <!-- 注释：返回 -->
    <div class="panel-actions">
      <button class="list-button" @click="emit('back')">{{ u('save.action.back') }}</button>
    </div>

    <!-- 注释：二次确认 -->
    <ConfirmDialog
      v-if="confirmAction"
      :message="confirmText"
      :confirm-text="confirmBtn"
      :cancel-text="u('save.action.cancel')"
      @confirm="onConfirm"
      @cancel="onCancelConfirm"
    />
  </div>
</template>

<style scoped>
.save-panel {
  display: flex;
  flex-direction: column;
  gap: var(--gap-small);
  min-height: 320px;
}

.panel-title {
  color: var(--color-primary);
  font-family: var(--font-title);
  margin-bottom: var(--gap-small);
}

.panel-hint {
  color: var(--color-text-secondary);
  text-align: center;
  padding: var(--gap-large);
}

.save-body {
  display: flex;
  flex-direction: column;
  gap: var(--gap-small);
}

.save-slot {
  padding: var(--gap-small) var(--gap-medium);
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  min-height: 44px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--gap-small);
  cursor: default;
  color: var(--color-text);
}

.save-slot.clickable {
  cursor: pointer;
}

.save-slot.clickable:hover {
  border-color: var(--color-primary);
}

.save-slot.empty {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

.slot-line {
  font-size: 0.875rem;
  line-height: 1.4;
}

.slot-flag {
  flex-shrink: 0;
  color: var(--color-primary);
  font-size: 0.75rem;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-button);
  padding: 2px 6px;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--gap-medium);
  margin-top: var(--gap-small);
}

.page-button {
  padding: var(--gap-small) var(--gap-medium);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  color: var(--color-text);
  cursor: pointer;
  min-height: 44px;
}

.page-button:disabled {
  opacity: 0.4;
  cursor: default;
}

.page-info {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

.panel-tools {
  text-align: center;
  margin-top: var(--gap-small);
}

.file-input {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  max-width: 100%;
}

.panel-message {
  text-align: center;
  color: var(--color-success);
  font-size: 0.875rem;
}

.panel-message.error {
  color: var(--color-danger);
}

.action-menu {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-small);
  margin-top: var(--gap-small);
}

.action-button {
  flex: 1;
  min-width: 88px;
  padding: var(--gap-small) var(--gap-medium);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  color: var(--color-text);
  cursor: pointer;
  min-height: 44px;
}

.action-button.primary {
  background-color: var(--color-primary);
  color: var(--color-surface);
}

.panel-actions {
  margin-top: var(--gap-small);
  text-align: center;
}

.list-button {
  padding: var(--gap-small) var(--gap-medium);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  color: var(--color-text);
  cursor: pointer;
  min-height: 44px;
  min-width: 88px;
}
</style>
