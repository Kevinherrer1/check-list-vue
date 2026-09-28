<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api/axios'
import { useTheme } from '../composables/useTheme'
import logoCvg from '../assets/logo_cvg_dorado.png'

const CVG_DOMAIN = '@cvg.gob.ve'
const knownLocals = [
  'ysabel.mantilla',
  'jessica.alfonzo',
  'darimar.zambrano',
  'norman.boccardo',
]

const { theme, setTheme } = useTheme()

const router = useRouter()
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const emailOpen = ref(false)
const activeIndex = ref(0)
const passwordEl = ref(null)

function localPart(value) {
  const v = String(value || '').trim().toLowerCase()
  const at = v.indexOf('@')
  return at === -1 ? v : v.slice(0, at)
}

const suggestions = computed(() => {
  const raw = email.value.trim()
  if (!raw) return []
  const typed = raw.toLowerCase()
  const q = localPart(raw)
  if (!q) return []
  if (typed.endsWith(CVG_DOMAIN)) {
    return knownLocals
      .map((u) => u + CVG_DOMAIN)
      .filter((full) => full.startsWith(typed) && full !== typed)
  }
  const fromKnown = knownLocals
    .filter((u) => u.startsWith(q) || u.includes(q))
    .map((u) => u + CVG_DOMAIN)
  const domainGuess = q + CVG_DOMAIN
  if (!fromKnown.includes(domainGuess)) {
    fromKnown.unshift(domainGuess)
  }
  return fromKnown
})

function completeDomain() {
  const v = email.value.trim()
  if (!v) return
  if (!v.includes('@')) {
    email.value = v + CVG_DOMAIN
    return
  }
  if (v.endsWith('@')) {
    email.value = v + 'cvg.gob.ve'
  }
}

function pickSuggestion(full) {
  email.value = full
  emailOpen.value = false
  passwordEl.value?.focus()
}

function onEmailInput() {
  emailOpen.value = true
  activeIndex.value = 0
}

function onEmailKeydown(event) {
  if (event.key === 'ArrowDown' && suggestions.value.length) {
    event.preventDefault()
    emailOpen.value = true
    activeIndex.value = (activeIndex.value + 1) % suggestions.value.length
    return
  }
  if (event.key === 'ArrowUp' && suggestions.value.length) {
    event.preventDefault()
    emailOpen.value = true
    activeIndex.value = (activeIndex.value - 1 + suggestions.value.length) % suggestions.value.length
    return
  }
  if (event.key === 'Escape') {
    emailOpen.value = false
    return
  }
  if (event.key !== 'Tab' && event.key !== 'Enter') return
  if (emailOpen.value && suggestions.value.length && !email.value.includes('@')) {
    event.preventDefault()
    pickSuggestion(suggestions.value[activeIndex.value] || suggestions.value[0])
    return
  }
  if (!email.value.includes('@') && email.value.trim()) {
    event.preventDefault()
    completeDomain()
    passwordEl.value?.focus()
  }
}

async function login() {
  error.value = ''
  completeDomain()
  loading.value = true
  try {
    const { data } = await api.post('/login', {
      email: email.value,
      password: password.value,
    })
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    router.push('/')
  } catch (e) {
    error.value = e.response?.data?.message
      || e.response?.data?.errors?.email?.[0]
      || 'Error al iniciar sesión'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="theme-switch login-theme" role="group" aria-label="Tema">
      <button type="button" :class="{ on: theme === 'light' }" @click="setTheme('light')">Claro</button>
      <button type="button" :class="{ on: theme === 'dark' }" @click="setTheme('dark')">Oscuro</button>
    </div>
    <form class="login-card" @submit.prevent="login">
      <img class="login-logo" :src="logoCvg" alt="CVG">
      <h1>Bitácora DBA</h1>
      <p class="meta">Checklist de servidores</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="login-email">
        <input
          v-model="email"
          type="text"
          inputmode="email"
          autocomplete="username"
          spellcheck="false"
          placeholder="correo@cvg.gob.ve"
          required
          @input="onEmailInput"
          @focus="emailOpen = true"
          @blur="completeDomain(); emailOpen = false"
          @keydown="onEmailKeydown"
        >
        <div v-if="emailOpen && suggestions.length" class="login-suggest" role="listbox">
          <button
            v-for="(item, index) in suggestions"
            :key="item"
            type="button"
            :class="{ on: index === activeIndex }"
            @mousedown.prevent="pickSuggestion(item)"
          >
            {{ item }}
          </button>
        </div>
      </div>
      <input
        ref="passwordEl"
        v-model="password"
        type="password"
        autocomplete="current-password"
        placeholder="Contraseña"
        required
      >
      <button class="btn primary" type="submit" :disabled="loading">
        {{ loading ? 'Entrando…' : 'Entrar' }}
      </button>
    </form>
  </div>
</template>
