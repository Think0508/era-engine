import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'

// @iarna/toml 依赖 Node 风格裸 global（parse-string.js）；WebView 环境垫片
;(globalThis as Record<string, unknown>).global = globalThis

const app = createApp(App)
app.use(createPinia())
app.mount('#app')