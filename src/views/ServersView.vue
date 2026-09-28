<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import api from '../api/axios'

function emptyForm(nextOrder = 1) {
  return {
    id: null,
    name: '',
    hostname: '',
    ip: '',
    ssh_command: '',
    username: '',
    system: '',
    typical_time: '',
    sort_order: nextOrder,
    mounts_text: '',
    does_backup: true,
    active: true,
    review_script: '/usr/local/bin/revision-dba.sh',
    netapp_volume: '',
    nfs_slug: '',
    nfs_root: '',
    observations: '',
  }
}

const servers = ref([])
const error = ref('')
const flash = ref('')
const loading = ref(false)
const saving = ref(false)
const form = ref(emptyForm())
const formBox = ref(null)
const advancedOpen = ref(false)
const formOpen = ref(false)

const editing = computed(() => !!form.value.id)

function nextOrder() {
  const max = servers.value.reduce((n, s) => Math.max(n, Number(s.sort_order) || 0), 0)
  return max + 1
}

function mountsText(server) {
  return (server.mounts || []).map((m) => m.path).join('\n')
}

async function load() {
  error.value = ''
  loading.value = true
  try {
    const { data } = await api.get('/servers')
    servers.value = data
    if (!formOpen.value) {
      form.value.sort_order = nextOrder()
    }
  } catch (e) {
    error.value = e.response?.data?.message || 'No se pudo cargar el inventario'
  } finally {
    loading.value = false
  }
}

function showFlash(text) {
  flash.value = text
  setTimeout(() => {
    if (flash.value === text) flash.value = ''
  }, 3500)
}

function scrollForm() {
  nextTick(() => formBox.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

function startNew() {
  form.value = emptyForm(nextOrder())
  advancedOpen.value = false
  formOpen.value = true
  error.value = ''
  scrollForm()
}

function startEdit(server) {
  form.value = {
    id: server.id,
    name: server.name || '',
    hostname: server.hostname || '',
    ip: server.ip || '',
    ssh_command: server.ssh_command || '',
    username: server.username || '',
    system: server.system || '',
    typical_time: server.typical_time || '',
    sort_order: server.sort_order || 0,
    mounts_text: mountsText(server),
    does_backup: !!server.does_backup,
    active: !!server.active,
    review_script: server.review_script || '',
    netapp_volume: server.netapp_volume || '',
    nfs_slug: server.nfs_slug || '',
    nfs_root: server.nfs_root || '',
    observations: server.observations || '',
  }
  advancedOpen.value = !!(
    form.value.netapp_volume
    || form.value.nfs_root
    || form.value.nfs_slug
    || (form.value.review_script && form.value.review_script !== '/usr/local/bin/revision-dba.sh')
  )
  error.value = ''
  formOpen.value = true
  scrollForm()
}

function cancelEdit() {
  form.value = emptyForm(nextOrder())
  advancedOpen.value = false
  formOpen.value = false
}

function payload() {
  return {
    name: form.value.name,
    hostname: form.value.hostname,
    ip: form.value.ip,
    ssh_command: form.value.ssh_command,
    username: form.value.username,
    system: form.value.system,
    typical_time: form.value.typical_time,
    sort_order: Number(form.value.sort_order) || 0,
    mounts_text: form.value.mounts_text,
    does_backup: !!form.value.does_backup,
    active: !!form.value.active,
    review_script: form.value.review_script,
    netapp_volume: form.value.netapp_volume,
    nfs_slug: form.value.nfs_slug,
    nfs_root: form.value.nfs_root,
    observations: form.value.observations,
  }
}

async function save() {
  if (!form.value.name.trim()) {
    error.value = 'El nombre es obligatorio'
    return
  }
  saving.value = true
  error.value = ''
  try {
    if (editing.value) {
      await api.put(`/servers/${form.value.id}`, payload())
      showFlash('Servidor actualizado. Si está activo, sale en Hoy al recargar el día.')
    } else {
      await api.post('/servers', payload())
      showFlash('Servidor agregado. Ábralo en Hoy para incluirlo en el checklist del día.')
    }
    await load()
    cancelEdit()
  } catch (e) {
    const errs = e.response?.data?.errors
    if (errs) {
      error.value = Object.values(errs).flat().join(' ')
    } else {
      error.value = e.response?.data?.message || 'No se pudo guardar'
    }
  } finally {
    saving.value = false
  }
}

async function removeServer() {
  if (!editing.value) return
  const ok = window.confirm(`¿Quitar “${form.value.name}” del inventario? También desaparece de los checklists.`)
  if (!ok) return
  saving.value = true
  error.value = ''
  try {
    await api.delete(`/servers/${form.value.id}`)
    showFlash('Servidor eliminado')
    await load()
    cancelEdit()
  } catch (e) {
    error.value = e.response?.data?.message || 'No se pudo eliminar'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="servers-page">
    <div class="top">
      <div>
        <h1>Inventario de servidores</h1>
        <p>IP, SSH, sistema y rutas NetApp que debe ver montadas cada día.</p>
      </div>
      <button type="button" class="btn primary" @click="startNew">Nuevo servidor</button>
    </div>

    <p v-if="flash" class="hint hint-ok">{{ flash }}</p>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="loading" class="hint">Cargando…</p>

    <div class="servidores-layout" :class="{ 'has-form': formOpen }">
      <div class="card">
        <table class="table">
          <thead>
            <tr>
              <th>Servidor</th>
              <th>Acceso</th>
              <th>Montajes</th>
              <th class="col-actions"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!servers.length && !loading">
              <td colspan="4" class="hint">No hay servidores. Use Nuevo servidor.</td>
            </tr>
            <tr v-for="server in servers" :key="server.id">
              <td>
                <strong>{{ server.name }}</strong><br>
                <span class="hint">{{ server.system }} {{ server.active ? '' : '· inactivo' }}</span>
              </td>
              <td>
                <span class="ip">{{ server.ip || server.hostname }}</span><br>
                <span class="hint">{{ server.ssh_command }}</span>
              </td>
              <td class="hint paths">{{ (server.mounts || []).map((m) => m.path).join(' · ') || '—' }}</td>
              <td class="col-actions">
                <button type="button" class="btn btn-sm" @click="startEdit(server)">Editar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="formOpen" ref="formBox" class="card servidores-form" id="form-servidor">
        <h2>{{ editing ? 'Editar servidor' : 'Agregar servidor' }}</h2>
        <p v-if="!editing" class="hint">Complete los datos y pulse Guardar para sumarlo al inventario y al checklist.</p>
        <form class="form-grid" autocomplete="off" @submit.prevent="save">
          <div class="full">
            <label>Nombre / instancia</label>
            <input v-model="form.name" required autofocus>
          </div>
          <div>
            <label>Hostname</label>
            <input v-model="form.hostname">
          </div>
          <div>
            <label>IP</label>
            <input v-model="form.ip">
          </div>
          <div class="full">
            <label>Comando SSH</label>
            <input v-model="form.ssh_command" placeholder="ssh usuario@host">
          </div>
          <div>
            <label>Usuario</label>
            <input v-model="form.username">
          </div>
          <div>
            <label>Sistema / BD</label>
            <input v-model="form.system">
          </div>
          <div>
            <label>Hora típica</label>
            <input v-model="form.typical_time" placeholder="3:30 am">
          </div>
          <div>
            <label>Orden</label>
            <input v-model.number="form.sort_order" type="number" min="0">
          </div>
          <div class="full">
            <label>Montajes NetApp (una por línea)</label>
            <textarea v-model="form.mounts_text" rows="3" placeholder="/BACKUP" />
          </div>
          <div>
            <label class="check-inline">
              <input v-model="form.does_backup" type="checkbox"> Se revisa respaldo
            </label>
          </div>
          <div>
            <label class="check-inline">
              <input v-model="form.active" type="checkbox"> Activo en checklist
            </label>
          </div>
          <div class="full">
            <details class="form-more" :open="advancedOpen">
              <summary>Opciones avanzadas (script SSH, NetApp, nota)</summary>
              <div class="form-grid form-nested">
                <div class="full">
                  <label>Script revisión remota</label>
                  <input v-model="form.review_script" placeholder="/usr/local/bin/revision-dba.sh">
                </div>
                <div>
                  <label>Volumen NetApp</label>
                  <input v-model="form.netapp_volume" placeholder="vol_sigesp_cal">
                </div>
                <div>
                  <label>Slug NFS</label>
                  <input v-model="form.nfs_slug" placeholder="sigesp-cal">
                </div>
                <div class="full">
                  <label>Raíz NFS local (solo lectura)</label>
                  <input v-model="form.nfs_root" placeholder="/mnt/netapp-ro/sigesp-cal">
                </div>
                <div class="full">
                  <label>Observación</label>
                  <textarea v-model="form.observations" rows="2" />
                </div>
              </div>
            </details>
          </div>
          <div class="full form-actions">
            <button
              v-if="editing"
              class="btn danger"
              type="button"
              :disabled="saving"
              @click="removeServer"
            >Eliminar</button>
            <span class="form-actions-spacer" />
            <button class="btn" type="button" @click="cancelEdit">Cerrar</button>
            <button class="btn primary" type="submit" :disabled="saving">
              {{ saving ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
