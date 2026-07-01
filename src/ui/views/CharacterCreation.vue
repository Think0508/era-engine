// 注释：CharacterCreation 角色创建流程
// 读取 mod meta.toml 的 [creation] steps，逐项执行后创建 player entity

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useGameStore } from '../stores/game-store'
import { mockPlayer, mockTownSquare, mockTime, mockCharactersAtTownSquare, mockCalendar, mockEquipmentSlots } from '../stores/mock-data'
import { registerNativeCommands } from '../native-commands'
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

function completeCreation() {
  // 注释：初始化游戏状态
  gameStore.setPlayer({ ...mockPlayer, name: creationData.name || '玩家' })
  gameStore.setLocation(mockTownSquare)
  gameStore.setTime(mockTime)
  gameStore.setCharactersAtLocation(mockCharactersAtTownSquare)
  gameStore.setCalendar(mockCalendar)
  gameStore.setEquipmentSlots(mockEquipmentSlots)
  registerNativeCommands()
  // 注释：进入每日菜单
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
