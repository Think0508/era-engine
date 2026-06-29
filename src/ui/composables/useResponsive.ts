// 注释：useResponsive 响应式断点检测
// PC 端：width >= 768px，移动端：< 768px
// 使用 @vueuse/core 的 useWindowSize 实现响应式

import { useWindowSize } from '@vueuse/core'
import { computed } from 'vue'

export function useResponsive() {
  const { width } = useWindowSize()
  // 注释：768px 是 Tailwind 的 md 断点
  const isMobile = computed(() => width.value < 768)
  const isPC = computed(() => width.value >= 768)
  return { isMobile, isPC, width }
}
