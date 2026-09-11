<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api/axios'

const router = useRouter()
const email = ref('test@test.com')
const password = ref('password')
const error = ref('')

async function login() {
  error.value = ''
  try {
    const { data } = await api.post('/login', {
      email: email.value,
      password: password.value,
    })
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    router.push('/dashboard')
  } catch (e) {
    error.value = e.response?.data?.message || 'Error al iniciar sesión'
  }
}
</script>

<template>
  <div>
    <h1>Login</h1>
    <p v-if="error">{{ error }}</p>
    <input v-model="email" type="email" placeholder="Email" />
    <input v-model="password" type="password" placeholder="Password" />
    <button @click="login">Entrar</button>
  </div>
</template>