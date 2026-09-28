<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api/axios'
import { useTheme } from '../composables/useTheme'
import logoCvg from '../assets/logo_cvg_dorado.png'

const router = useRouter()
const { theme, setTheme } = useTheme()
const user = computed(() => {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null')
  } catch {
    return null
  }
})

async function logout() {
  try {
    await api.post('/logout')
  } finally {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/login')
  }
}
</script>

<template>
  <div class="app-shell">
    <aside class="side">
      <div class="brand">
        <img class="brand-mark" :src="logoCvg" alt="CVG">
        <div>
          <small>Operación diaria</small>
          <strong>Bitácora DBA</strong>
        </div>
      </div>
      <nav class="nav">
        <router-link to="/"><span class="dot" /> Hoy</router-link>
        <router-link to="/servidores"><span class="dot" /> Servidores</router-link>
        <router-link to="/reportes"><span class="dot" /> Reportes</router-link>
      </nav>
      <div class="side-foot">
        <div class="theme-switch" role="group" aria-label="Tema">
          <button type="button" :class="{ on: theme === 'light' }" @click="setTheme('light')">Claro</button>
          <button type="button" :class="{ on: theme === 'dark' }" @click="setTheme('dark')">Oscuro</button>
        </div>
        <p>{{ user?.name || 'Usuario' }}</p>
        <button class="btn" @click="logout">Salir</button>
      </div>
    </aside>
    <main class="main">
      <router-view />
    </main>
  </div>
</template>
