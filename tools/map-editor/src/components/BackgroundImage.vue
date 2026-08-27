<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import { useMapStore } from '../stores/mapStore'
import { useUiStore } from '../stores/uiStore'

const props = defineProps<{ url: string; width: number; height: number }>()

const { viewport } = useVueFlow()
const mapStore = useMapStore()
const ui = useUiStore()

interface ClickZone {
  x: number
  y: number
  w: number
  h: number
}

interface DragState {
  mode: 'move' | 'resize'
  zoneIndex: number
  startX: number
  startY: number
  startZone: ClickZone
  handle?: string
  rect: DOMRect
}

const selectedNode = computed(() => mapStore.nodes.find(n => n.id === ui.selectedNodeId) ?? null)
const showZones = computed(() => {
  const n = selectedNode.value
  return !!n && mapStore.isModeB && n.parent === (ui.focusNodeId ?? null)
})
const storeZones = computed<ClickZone[]>(() => (selectedNode.value?.attrs as any)?.clickZones ?? [])
const localZones = ref<ClickZone[] | null>(null)
const zones = computed(() => localZones.value ?? storeZones.value)
const dragState = ref<DragState | null>(null)

const bgStyle = computed(() => ({
  position: 'absolute' as const,
  left: '0px',
  top: '0px',
  width: `${props.width}px`,
  height: `${props.height}px`,
  transform: `translate(${viewport.value.x}px, ${viewport.value.y}px) scale(${viewport.value.zoom})`,
  transformOrigin: '0 0',
  zIndex: 0,
  pointerEvents: 'none' as const,
}))

function zoneStyle(z: ClickZone) {
  return {
    left: `${z.x * 100}%`,
    top: `${z.y * 100}%`,
    width: `${z.w * 100}%`,
    height: `${z.h * 100}%`,
  }
}

function commitZones() {
  const node = selectedNode.value
  if (!node || !localZones.value) return
  mapStore.updateNode(node.id, {
    attrs: { ...(node.attrs as any), clickZones: localZones.value },
  })
  localZones.value = null
}

function startDragZone(index: number, event: MouseEvent) {
  event.stopPropagation()
  event.preventDefault()
  if (!zones.value[index]) return
  const root = (event.currentTarget as HTMLElement).parentElement as HTMLElement
  const rect = root.getBoundingClientRect()
  localZones.value = zones.value.map(z => ({ ...z }))
  dragState.value = {
    mode: 'move',
    zoneIndex: index,
    startX: event.clientX,
    startY: event.clientY,
    startZone: { ...zones.value[index] },
    rect,
  }
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp, { once: true })
}

function startResize(index: number, handle: string, event: MouseEvent) {
  event.stopPropagation()
  event.preventDefault()
  if (!zones.value[index]) return
  const root = (event.currentTarget as HTMLElement).parentElement?.parentElement as HTMLElement
  const rect = root.getBoundingClientRect()
  localZones.value = zones.value.map(z => ({ ...z }))
  dragState.value = {
    mode: 'resize',
    zoneIndex: index,
    startX: event.clientX,
    startY: event.clientY,
    startZone: { ...zones.value[index] },
    handle,
    rect,
  }
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp, { once: true })
}

function onMouseMove(event: MouseEvent) {
  const st = dragState.value
  if (!st || !localZones.value) return
  const rect = st.rect
  const dx = (event.clientX - st.startX) / rect.width
  const dy = (event.clientY - st.startY) / rect.height
  const zone = { ...st.startZone }
  const min = 0.01

  if (st.mode === 'move') {
    zone.x = Math.min(1 - zone.w, Math.max(0, zone.x + dx))
    zone.y = Math.min(1 - zone.h, Math.max(0, zone.y + dy))
  } else if (st.mode === 'resize' && st.handle) {
    if (st.handle.includes('w')) {
      const nx = Math.min(zone.x + zone.w - min, Math.max(0, zone.x + dx))
      zone.w += zone.x - nx
      zone.x = nx
    }
    if (st.handle.includes('e')) {
      zone.w = Math.min(1 - zone.x, Math.max(min, zone.w + dx))
    }
    if (st.handle.includes('n')) {
      const ny = Math.min(zone.y + zone.h - min, Math.max(0, zone.y + dy))
      zone.h += zone.y - ny
      zone.y = ny
    }
    if (st.handle.includes('s')) {
      zone.h = Math.min(1 - zone.y, Math.max(min, zone.h + dy))
    }
  }

  localZones.value[st.zoneIndex] = zone
}

function onMouseUp() {
  dragState.value = null
  commitZones()
  window.removeEventListener('mousemove', onMouseMove)
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  localZones.value = null
  dragState.value = null
})
</script>

<template>
  <div class="flow-bg-img" :style="bgStyle">
    <img :src="url" :style="{ width: width + 'px', height: height + 'px' }" draggable="false" />
    <template v-if="showZones">
      <div
        v-for="(zone, zi) in zones"
        :key="zi"
        class="click-zone"
        :style="zoneStyle(zone)"
        @mousedown.stop="startDragZone(zi, $event)"
      >
        <span class="zone-handle nw" @mousedown.stop="startResize(zi, 'nw', $event)" />
        <span class="zone-handle ne" @mousedown.stop="startResize(zi, 'ne', $event)" />
        <span class="zone-handle sw" @mousedown.stop="startResize(zi, 'sw', $event)" />
        <span class="zone-handle se" @mousedown.stop="startResize(zi, 'se', $event)" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.flow-bg-img {
  pointer-events: none;
}
.flow-bg-img img {
  display: block;
  object-fit: fill;
  user-select: none;
}
.click-zone {
  position: absolute;
  pointer-events: auto;
  background: rgba(59, 130, 246, 0.25);
  border: 2px solid rgba(59, 130, 246, 0.8);
  cursor: move;
  box-sizing: border-box;
}
.zone-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #fff;
  border: 2px solid #3b82f6;
  pointer-events: auto;
  cursor: nwse-resize;
}
.zone-handle.nw { left: -6px; top: -6px; cursor: nwse-resize; }
.zone-handle.ne { right: -6px; top: -6px; cursor: nesw-resize; }
.zone-handle.sw { left: -6px; bottom: -6px; cursor: nesw-resize; }
.zone-handle.se { right: -6px; bottom: -6px; cursor: nwse-resize; }
</style>