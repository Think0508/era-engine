// 注释：useKeyInput 键盘输入处理
// 数字输入缓冲：连续输入数字 → 回车执行对应编号指令
// y/n 快捷确认，ESC 取消
// 方向键焦点切换（用于对话选项）

import { ref, onMounted, onUnmounted } from 'vue'

export function useKeyInput(options: {
  onNumberConfirm?: (number: number) => void
  onYes?: () => void
  onNo?: () => void
  onCancel?: () => void
  onArrow?: (direction: 'up' | 'down' | 'left' | 'right') => void
}) {
  const numberBuffer = ref('')

  function handleKeydown(e: KeyboardEvent) {
    // 注释：数字输入——连续输入数字到 buffer
    if (e.key >= '0' && e.key <= '9') {
      numberBuffer.value += e.key
      return
    }
    // 注释：回车——执行对应编号指令
    if (e.key === 'Enter' && numberBuffer.value && options.onNumberConfirm) {
      e.preventDefault()
      options.onNumberConfirm(parseInt(numberBuffer.value))
      numberBuffer.value = ''
      return
    }
    // 注释：y/n 快捷确认
    if (e.key === 'y' && options.onYes) {
      e.preventDefault()
      options.onYes()
      return
    }
    if (e.key === 'n' && options.onNo) {
      e.preventDefault()
      options.onNo()
      return
    }
    // 注释：ESC 取消
    if (e.key === 'Escape' && options.onCancel) {
      e.preventDefault()
      options.onCancel()
      numberBuffer.value = ''
      return
    }
    // 注释：方向键
    if (e.key === 'ArrowUp' && options.onArrow) {
      options.onArrow('up')
      return
    }
    if (e.key === 'ArrowDown' && options.onArrow) {
      options.onArrow('down')
      return
    }
    if (e.key === 'ArrowLeft' && options.onArrow) {
      options.onArrow('left')
      return
    }
    if (e.key === 'ArrowRight' && options.onArrow) {
      options.onArrow('right')
      return
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown)
  })

  return { numberBuffer }
}
