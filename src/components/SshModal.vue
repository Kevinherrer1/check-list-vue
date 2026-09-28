<script setup>
import { computed, nextTick, ref, watch } from 'vue'

const SSH_USER_KEY = 'bitacora_ssh_user'

const props = defineProps({
  open: { type: Boolean, default: false },
  label: { type: String, default: 'Servidor' },
  host: { type: String, default: '' },
  serverUser: { type: String, default: '' },
  teamUsers: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'submit'])

const user = ref('')
const password = ref('')
const error = ref('')
const userEl = ref(null)
const passwordEl = ref(null)

function lastSshUser() {
  try {
    return (localStorage.getItem(SSH_USER_KEY) || '').trim()
  } catch {
    return ''
  }
}

function rememberSshUser(value) {
  try {
    if (value) {
      localStorage.setItem(SSH_USER_KEY, value)
    }
  } catch {
    /* ignore */
  }
}

const chips = computed(() => {
  const seen = new Set()
  const list = []
  const add = (value, kind) => {
    const v = String(value || '').trim()
    if (!v) return
    const key = v.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    list.push({ value: v, kind })
  }
  props.teamUsers.forEach((u) => add(u, 'team'))
  if (props.teamUsers.length) add(props.serverUser, 'server')
  return list
})

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    error.value = ''
    password.value = ''
    if (props.teamUsers.length) {
      user.value = lastSshUser() || props.serverUser || ''
    } else {
      user.value = props.serverUser || ''
    }
    await nextTick()
    if (user.value) {
      passwordEl.value?.focus()
    } else {
      userEl.value?.focus()
    }
  },
)

function pickUser(value) {
  user.value = value
  error.value = ''
  passwordEl.value?.focus()
}

function close() {
  emit('close')
}

function submit() {
  const u = user.value.trim()
  const p = password.value
  if (!u) {
    error.value = 'Elija o escriba el usuario SSH.'
    userEl.value?.focus()
    return
  }
  if (!p) {
    error.value = 'Escriba la contraseña SSH.'
    passwordEl.value?.focus()
    return
  }
  if (props.teamUsers.length) {
    rememberSshUser(u)
  }
  emit('submit', { user: u, password: p })
}

function onKey(event, field) {
  if (event.key === 'Escape') {
    close()
    return
  }
  if (event.key !== 'Enter') return
  event.preventDefault()
  if (field === 'user') {
    if (user.value.trim()) {
      passwordEl.value?.focus()
    } else {
      error.value = 'Elija o escriba el usuario SSH.'
    }
    return
  }
  submit()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="ssh-modal-backdrop" @click.self="close">
      <div class="ssh-modal" role="dialog" aria-modal="true">
        <h3>Acceso SSH</h3>
        <p>
          <strong>{{ label }}</strong>
          <template v-if="host"><br>{{ host }}</template>
        </p>
        <p v-if="teamUsers.length" class="ssh-modal-note">Pulse su usuario o escríbalo. La clave no se guarda.</p>
        <p v-else class="ssh-modal-note">Usuario de este servidor. La clave no se guarda.</p>
        <label for="ssh-modal-user">Usuario</label>
        <input
          id="ssh-modal-user"
          ref="userEl"
          v-model="user"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="ej. ysabel_mantilla"
          @keydown="onKey($event, 'user')"
        >
        <div v-if="chips.length" class="ssh-user-chips">
          <button
            v-for="chip in chips"
            :key="chip.value"
            type="button"
            class="ssh-chip"
            :class="{
              on: user.trim().toLowerCase() === chip.value.toLowerCase(),
              'ssh-chip-server': chip.kind === 'server',
            }"
            @click="pickUser(chip.value)"
          >
            {{ chip.value }}{{ chip.kind === 'server' ? ' · este servidor' : '' }}
          </button>
        </div>
        <p v-if="teamUsers.length && serverUser" class="ssh-user-hint">
          En este servidor el usuario SSH configurado es <strong>{{ serverUser }}</strong>.
        </p>
        <label for="ssh-modal-pw">Contraseña</label>
        <input
          id="ssh-modal-pw"
          ref="passwordEl"
          v-model="password"
          type="password"
          autocomplete="current-password"
          @keydown="onKey($event, 'password')"
        >
        <p v-if="error" class="ssh-modal-error">{{ error }}</p>
        <div class="toolbar ssh-modal-actions">
          <button type="button" class="btn" @click="close">Cancelar</button>
          <button type="button" class="btn primary" @click="submit">Revisar</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
