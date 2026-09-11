<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api/axios'

const router = useRouter()
const user = ref(null)

onMounted(async () => {
  try {
    const { data } = await api.get('/user')
    user.value = data
  } catch {
    localStorage.removeItem('token')
    router.push('/login')
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
  <div>
    <h1>Dashboard</h1>
    <p v-if="user">Hola, {{ user.name }}</p>
    <button @click="logout">Salir</button>
  </div>
</template>