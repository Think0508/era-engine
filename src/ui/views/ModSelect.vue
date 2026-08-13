// 注释：ModSelect 模组选择界面
// 列出 mods/ 下所有含 meta.toml 的目录
// 只读 name/description（最小化，不加载 mod 数据）
// 选择后写 localStorage 覆盖键（era-engine:active-mod，config.toml 只作缺省）→ 刷新重载
// 不写回 era-engine.config.toml（构建期 ?raw 导入不可写 + 避免污染 git）

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const emit = defineEmits<{
  (e: 'select', modId: string): void
}>()

interface ModInfo {
  id: string
  name: string
  description?: string
}

const mods = ref<ModInfo[]>([])

function selectMod(modId: string): void {
  try {
    localStorage.setItem('era-engine:active-mod', modId)
  } catch {
    // 注释：localStorage 不可用时静默（仍以内存选择继续）
  }
  emit('select', modId)
  // 注释：切换模组 = 重启加载（glob 构建期扫描 + 引擎初始化），刷新页面实现
  window.location.reload()
}

onMounted(async () => {
  // 注释：用 Vite glob 扫描所有 mod 的 meta.toml
  const metaFiles = import.meta.glob('/mods/*/meta.toml', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  const { parse: parseTOML } = await import('@iarna/toml')
  for (const [path, raw] of Object.entries(metaFiles)) {
    try {
      const data = parseTOML(raw) as any
      const meta = data.meta
      if (meta) {
        // 注释：从路径 /mods/{id}/meta.toml 提取 mod id
        const match = path.match(/^\/mods\/([^/]+)\/meta\.toml$/)
        const id = match ? match[1] : meta.id
        mods.value.push({
          id,
          name: meta.name ?? id,
          description: meta.description,
        })
      }
    } catch {
      // 注释：meta.toml 解析失败跳过此 mod
    }
  }
})
</script>

<template>
  <div class="mod-select">
    <h1 class="mod-select-title">选择模组</h1>
    <div class="mod-list">
      <div
        v-for="mod in mods"
        :key="mod.id"
        class="mod-card"
        @click="selectMod(mod.id)"
      >
        <h2 class="mod-name">{{ mod.name }}</h2>
        <p v-if="mod.description" class="mod-description">{{ mod.description }}</p>
        <p class="mod-id">{{ mod.id }}</p>
      </div>
    </div>
    <p v-if="mods.length === 0" class="no-mods">未找到可用模组（请在 mods/ 目录下创建模组）</p>
  </div>
</template>


<style scoped>
.mod-select {
  min-height: 100vh;
  background-color: var(--color-background);
  color: var(--color-text);
  font-family: var(--font-body);
  padding: var(--gap-large);
}

.mod-select-title {
  font-family: var(--font-title);
  color: var(--color-primary);
  margin-bottom: var(--gap-large);
}

.mod-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--gap-medium);
}

.mod-card {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  padding: var(--gap-medium);
  cursor: pointer;
  transition: border-color 0.2s;
}

.mod-card:hover {
  border-color: var(--color-primary);
}

.mod-name {
  font-size: 1.25rem;
  margin-bottom: var(--gap-small);
  color: var(--color-primary);
}

.mod-description {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  margin-bottom: var(--gap-small);
}

.mod-id {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  font-family: monospace;
}

.no-mods {
  color: var(--color-text-secondary);
  text-align: center;
  margin-top: var(--gap-large);
}
</style>
