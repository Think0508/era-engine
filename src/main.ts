// 注释：main.ts 引擎入口
// 简化版启动——加载 mod，失败则用 mock 数据确保 UI 可显示

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'

async function main() {
  const pinia = createPinia()
  const app = createApp(App)
  app.use(pinia)

  // 注释：尝试加载 test-mod，静默处理错误
  try {
    const { modLoader } = await import('./core/mod-loader')
    const { gameContext } = await import('./core/game-context')
    const { entitySystem } = await import('./core/entity-system')
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()
    if (mod) {
      const playerCharId = 'player'
      gameContext.setPlayer(playerCharId)
      const startLoc = entitySystem.get('location', 'town_square') as any
      if (startLoc) gameContext.setLocation(startLoc)
    }
  } catch (e) {
    console.warn('模组加载失败，使用 mock 数据:', e)
  }

  app.mount('#app')
}

main().catch(err => {
  console.error('引擎启动失败：', err)
  // 注释：即使全部失败，也尝试显示空白界面
  document.getElementById('app')!.innerHTML = '<p style="color:red;padding:20px">引擎启动失败，请查看控制台错误信息</p>'
})

