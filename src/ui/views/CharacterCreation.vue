// 注释：CharacterCreation 角色创建流程（2026-08-14 接线修复）
// 读取 mod meta.toml 的 [creation] steps，逐项执行后创建 player entity
// ⚠️ 修复：原实现用 mock 数据只填 Pinia（core 无玩家/地点，行动即报错）+ 重复调用
// registerNativeCommands（main.ts 已注册 → commandRegistry 同 id 抛错 → 点击必崩）。
// 现改为真实 mod 数据初始化 core + 同步 Pinia。真实多步骤创建流程仍为 TODO（另立任务）

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useGameStore } from '../stores/game-store'
import { gameContext } from '../../core/game-context'
import { entitySystem } from '../../core/entity-system'
import { modLoader } from '../../core/mod-loader'
import { apiSystem } from '../../core/api'
import { errorReporter } from '../../core/error-reporter'
import GameButton from '../components/GameButton.vue'

const emit = defineEmits<{
  (e: 'complete'): void
}>()

const gameStore = useGameStore()

interface CreationStep {
  type: 'input' | 'choose' | 'dialogue' | 'image'
  field?: string
  prompt?: string
  choices?: string[]
  src?: string
}

const creationConfig = ref<{ steps: CreationStep[] }>({ steps: [] })
const currentStepIndex = ref(0)
const creationData = reactive<Record<string, any>>({ name: '玩家' })
const inputValue = ref('')

onMounted(() => {
  // 注释：尝试加载 mod 的角色创建配置
  // 无配置时直接用默认数据完成
  loadCreationConfig()
})

function loadCreationConfig() {
  // TODO: 从 meta.toml 的 [creation] 读取
  // 当前简化——使用默认步骤
  creationConfig.value = {
    steps: [
      { type: 'input', field: 'name', prompt: '你叫什么名字？' },
      { type: 'choose', field: '背景', prompt: '你的出身是？', choices: ['平民', '贵族', '江湖人'] },
    ]
  }
}

const currentStep = computed(() => {
  return creationConfig.value.steps[currentStepIndex.value]
})

function nextStep() {
  if (currentStep.value.field) {
    creationData[currentStep.value.field] = inputValue.value || creationData[currentStep.value.field]
  }
  if (currentStepIndex.value < creationConfig.value.steps.length - 1) {
    currentStepIndex.value++
    inputValue.value = ''
  } else {
    completeCreation()
  }
}

function selectChoice(choice: string) {
  if (currentStep.value.field) {
    creationData[currentStep.value.field] = choice
  }
  if (currentStepIndex.value < creationConfig.value.steps.length - 1) {
    currentStepIndex.value++
  } else {
    completeCreation()
  }
}

function completeCreation(): void {
  // 注释：async 链在内部保证（initLocations 完成后才同步角色列表）
  // ⚠️ 2026-08-14 第六轮审计：void 调用必须 catch——内部异常否则变
  // unhandledrejection → 触发全局崩溃存档（创建流程失败不属崩溃场景）。
  // 失败仍进入游戏（世界可能半初始化——极罕见路径，好于卡死在创建界面）
  void initWorldAndEnter().catch((e: any) => {
    errorReporter.report({
      source: 'character-creation',
      severity: 'error',
      message: `角色创建初始化失败：${e?.message ?? e}`,
    })
    emit('complete')
  })
}

async function initWorldAndEnter(): Promise<void> {
  // 注释：core 初始化（真实 mod 数据——替代原 mock 桩）
  const mod = modLoader.getMod()
  gameContext.reset()
  // 注释：⚠️ 2026-08-14 第四轮审查——干净世界：entitySystem.clear + 从 mod 初始数据
  // 重建（"退出到标题→新游戏"场景：原实现直接取 entitySystem.get 拿到的是旧会话
  // 污染实体——新游戏带着上次的移动/物品/状态）
  modLoader.resetWorld()
  const playerId = mod?.playerCharacter ?? 'player'
  const playerEntity = entitySystem.get('character', playerId) as any
  if (playerEntity) {
    if (creationData.name && creationData.name !== '玩家') {
      playerEntity.name = creationData.name
    }
    gameContext.setPlayer(playerId)
  }
  const startLoc = mod?.startingLocation
    ? entitySystem.get('location', mod.startingLocation)
    : null
  const loc = startLoc ?? mod?.locations.values().next().value ?? null
  if (loc) gameContext.setLocation(loc as any)
  gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
  // 注释：⚠️ 2026-08-14 第五轮审查——reset 清掉了关系组（聚合条件 any(group:xxx) 需要）；
  // resetWorld 不重设 → 新游戏后关系组聚合条件失效。补回
  gameContext.setRelationGroups(mod?.relationGroups ?? {})
  // 注释：⚠️ 2026-08-14 第五轮审查——世界重建后 NPC 位置重新分配（character-system 的
  // initLocations API——onEnable 只跑一次，resetWorld 后 NPC current_location 全空，
  // 不重跑则新游戏 NPC 全部消失）。插件未就绪时静默跳过。
  // await 保证位置分配先于下方角色列表过滤（否则列表仍为空）
  try {
    await apiSystem.call('character', 'initLocations')
  } catch {
    // 注释：API 不可用（插件未加载）静默
  }

  // 注释：Pinia 同步（与 bridge 同源——core 是 source of truth）
  const ctx = gameContext.getContext()
  gameStore.setPlayer(ctx.player ? JSON.parse(JSON.stringify(ctx.player)) : null)
  gameStore.setLocation(ctx.location)
  gameStore.setTime(ctx.time)
  const chars = entitySystem.getAll('character').filter(c => (c as any).current_location === ctx.location?.id)
  gameStore.setCharactersAtLocation(JSON.parse(JSON.stringify(chars)))
  gameStore.setCalendar(mod?.calendar ? {
    month_names: mod.calendar.month_names,
    weekday_names: mod.calendar.weekday_names,
    hour_names: mod.calendar.hour_names,
  } : null)
  gameStore.setEquipmentSlots(mod?.equipmentSlots ?? [])
  // 注释：进入每日菜单（第一天起床菜单）
  gameStore.pushMode('daily_menu')
  emit('complete')
}
</script>

<template>
  <div class="creation-screen">
    <div class="creation-card">
      <h2 class="creation-title">创建角色</h2>

      <!-- 注释：input 类型 -->
      <div v-if="currentStep?.type === 'input'" class="step-content">
        <p class="step-prompt">{{ currentStep.prompt }}</p>
        <input
          v-model="inputValue"
          class="step-input"
          :placeholder="creationData.name || '输入名字...'"
          @keyup.enter="nextStep"
        />
        <GameButton label="确认" @click="nextStep" />
      </div>

      <!-- 注释：choose 类型 -->
      <div v-if="currentStep?.type === 'choose'" class="step-content">
        <p class="step-prompt">{{ currentStep.prompt }}</p>
        <div v-for="choice in currentStep.choices" :key="choice" class="step-choice" @click="selectChoice(choice)">
          {{ choice }}
        </div>
      </div>

      <div class="step-indicator">
        步骤 {{ currentStepIndex + 1 }} / {{ creationConfig.steps.length }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.creation-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-background);
}

.creation-card {
  max-width: 500px;
  width: 100%;
  padding: var(--gap-large);
  background-color: var(--color-surface);
  border-radius: var(--radius-panel);
  border: 1px solid var(--color-border);
}

.creation-title {
  color: var(--color-primary);
  font-family: var(--font-title);
  text-align: center;
  margin-bottom: var(--gap-large);
}

.step-prompt {
  color: var(--color-text);
  margin-bottom: var(--gap-medium);
}

.step-input {
  width: 100%;
  padding: var(--gap-small);
  margin-bottom: var(--gap-medium);
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  color: var(--color-text);
  font-size: 1rem;
}

.step-choice {
  padding: var(--gap-medium);
  margin-bottom: var(--gap-small);
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  cursor: pointer;
  color: var(--color-text);
  min-height: 44px;
  display: flex;
  align-items: center;
}

.step-choice:hover {
  background-color: var(--color-primary);
  color: var(--color-surface);
}

.step-indicator {
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  margin-top: var(--gap-medium);
}
</style>
