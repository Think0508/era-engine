import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

// Catch and display any initialization errors
window.addEventListener('error', (e) => {
  document.body.innerHTML = `<pre style="color:red;padding:20px">ERROR: ${e.message}\n${e.filename}:${e.lineno}</pre>`
})

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
