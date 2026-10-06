<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import api from '../api/axios'
import SshModal from '../components/SshModal.vue'
import { downloadChecklistPdf } from '../composables/useChecklistPdf'

function todayYmd() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function dateFromQuery(value) {
  const q = String(value || '')
  return /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayYmd()
}

const route = useRoute()
const date = ref(dateFromQuery(route.query.fecha))
const review = ref(null)
const error = ref('')
const loading = ref(false)
const toast = ref('')
const pingAllBusy = ref(false)
const sshAllBusy = ref(false)
const pdfBusy = ref(false)
const pingUi = reactive({})
const sshBusy = reactive({})
const sshPolls = new Map()
let disposed = false
let toastTimer

const sshModal = ref({
  open: false,
  check: null,
  resolve: null,
})

const checks = computed(() => review.value?.checks ?? [])

const sshTeamUsers = [
  'ysabel_mantilla',
  'jessica_alfonzo',
  'darimar_zambrano',
  'norman_boccardo',
]

function isDeb14(check) {
  const server = check?.server || {}
  const blob = [server.hostname, server.name, server.ip, server.ssh_command]
    .join(' ')
    .toLowerCase()
  return blob.includes('deb14') || server.ip === '172.25.214.118'
}

function sshModalTeamUsers(check) {
  return isDeb14(check) ? sshTeamUsers : []
}

function suggestedSshUser(check) {
  const serverUser = String(check?.server?.username || '').trim()
  if (!isDeb14(check)) {
    return serverUser
  }
  try {
    return (localStorage.getItem('bitacora_ssh_user') || '').trim() || serverUser
  } catch {
    return serverUser
  }
}

function hostOf(check) {
  return check.server?.ip || check.server?.hostname || ''
}

function canSsh(check) {
  return !!(check.server?.review_script || check.server?.ssh_command)
}

function sshLabel(check) {
  return check.server?.review_script ? 'SSH' : 'SSH test'
}

function estado(check) {
  if (check.powered_on === 'apagado' || check.mounts_status === 'falla' || check.backup === 'fallido') {
    return 'falla'
  }
  const onOk = check.powered_on === 'prendido'
  const mountsOk = ['ok', 'na'].includes(check.mounts_status)
  const backupOk = ['exitoso', 'na'].includes(check.backup)
  if (onOk && mountsOk && backupOk) {
    return 'ok'
  }
  return 'parcial'
}

const resumen = computed(() => {
  const rows = checks.value
  const ok = rows.filter((c) => estado(c) === 'ok').length
  const falla = rows.filter((c) => estado(c) === 'falla').length
  const parcial = rows.length - ok - falla
  const pct = rows.length ? Math.round((100 * ok) / rows.length) : 0
  return { ok, falla, parcial, pct, total: rows.length }
})

function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, String(msg || '').length > 80 ? 7000 : 2800)
}

function replaceCheck(updated) {
  if (!review.value?.checks || !updated?.id) return
  const i = review.value.checks.findIndex((c) => c.id === updated.id)
  if (i !== -1) {
    review.value.checks.splice(i, 1, updated)
  }
}

async function loadReview() {
  error.value = ''
  loading.value = true
  try {
    const { data } = await api.get(`/reviews/${date.value}`)
    review.value = data
    for (const check of data.checks || []) {
      if (['queued', 'running'].includes(check.ssh_status) && check.ssh_job_id) {
        pollSshRevision(check.ssh_job_id, check)
      }
    }
  } catch (e) {
    error.value = e.response?.data?.message || 'No se pudo cargar el día'
    review.value = null
  } finally {
    loading.value = false
  }
}

async function patchCheck(check, payload) {
  error.value = ''
  try {
    const { data } = await api.patch(`/checks/${check.id}`, payload)
    replaceCheck(data)
  } catch (e) {
    error.value = e.response?.data?.message || 'No se pudo guardar el chequeo'
  }
}

function askSshCredentials(check) {
  return new Promise((resolve) => {
    sshModal.value = { open: true, check, resolve }
  })
}

function closeSshModal() {
  const resolve = sshModal.value.resolve
  sshModal.value = { open: false, check: null, resolve: null }
  resolve?.(null)
}

function submitSshModal(creds) {
  const resolve = sshModal.value.resolve
  sshModal.value = { open: false, check: null, resolve: null }
  resolve?.(creds)
}

function pingButtonText(check) {
  return pingUi[check.id]?.label || 'Ping'
}

function pingButtonClass(check) {
  return pingUi[check.id]?.ok ? 'primary' : ''
}

async function pingCheck(check) {
  const host = hostOf(check)
  if (!host) return
  pingUi[check.id] = { label: 'Ping…', busy: true, ok: false }
  try {
    const { data } = await api.post(`/checks/${check.id}/ping`, {}, { timeout: 15000 })
    if (data.ok) {
      pingUi[check.id] = { label: `OK ${data.ms ?? ''} ms`, busy: true, ok: true }
      if (data.check) replaceCheck(data.check)
    } else {
      pingUi[check.id] = { label: 'Sin ICMP', busy: true, ok: false }
      showToast('Ping ICMP sin respuesta (normal si está filtrado). Use SSH para revisar.')
    }
  } catch (e) {
    pingUi[check.id] = { label: 'Ping falló', busy: true, ok: false }
    showToast(e.response?.data?.message || e.message || 'Ping falló')
  } finally {
    setTimeout(() => {
      pingUi[check.id] = { label: 'Ping', busy: false, ok: false }
    }, 2800)
  }
}

async function pingAll() {
  pingAllBusy.value = true
  for (const check of checks.value) {
    if (!hostOf(check)) continue
    await pingCheck(check)
    await new Promise((r) => setTimeout(r, 350))
  }
  pingAllBusy.value = false
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function pollSshRevision(jobId, check) {
  if (sshPolls.has(jobId)) {
    return sshPolls.get(jobId)
  }

  const polling = (async () => {
    sshBusy[check.id] = true

    try {
      while (!disposed) {
        const { data } = await api.get(`/ssh-revisions/${jobId}`)
        if (data.check) replaceCheck(data.check)

        if (data.status === 'completed') {
          showToast(`${check.server?.name}: revisión SSH completada`)
          return true
        }

        if (data.status === 'failed') {
          showToast(`${check.server?.name}: ${data.error || 'Error SSH'}`)
          return false
        }

        await delay(350)
      }

      return false
    } catch (e) {
      if (!disposed) {
        showToast(e.response?.data?.message || e.message || 'No se pudo consultar la revisión SSH')
      }
      return false
    } finally {
      sshBusy[check.id] = false
      sshPolls.delete(jobId)
    }
  })()

  sshPolls.set(jobId, polling)

  return polling
}

async function queueSshRevision(check, creds) {
  sshBusy[check.id] = true
  try {
    const { data } = await api.post(
      `/checks/${check.id}/ssh`,
      { ssh_user: creds.user, password: creds.password },
      { timeout: 28000 },
    )

    if (data.check) replaceCheck(data.check)

    if (data.status === 'completed') {
      showToast(`${check.server?.name}: revisión SSH completada`)
      return true
    }

    if (data.status === 'failed') {
      showToast(`${check.server?.name}: ${data.error || 'Error SSH'}`)
      return false
    }

    if (!data.job_id) {
      showToast(`${check.server?.name}: no se pudo iniciar SSH`)
      return false
    }

    return await pollSshRevision(data.job_id, check)
  } finally {
    sshBusy[check.id] = false
  }
}

async function sshCheck(check) {
  if (!canSsh(check) || sshBusy[check.id]) return
  const creds = await askSshCredentials(check)
  if (!creds) return
  try {
    return await queueSshRevision(check, creds)
  } catch (e) {
    showToast(e.response?.data?.message || e.response?.data?.error || e.message || 'Error SSH')
    return false
  }
}

async function sshAll() {
  const targets = checks.value.filter(canSsh)
  if (!targets.length) {
    showToast('Ningún servidor tiene SSH configurado')
    return
  }
  sshAllBusy.value = true
  const pending = []
  let lastCreds = null
  for (const check of targets) {
    const suggested = suggestedSshUser(check)
    const creds = lastCreds && suggested && lastCreds.user === suggested
      ? lastCreds
      : await askSshCredentials(check)
    if (!creds) {
      showToast(pending.length ? 'Revisión parcial: faltan servidores' : 'Revisión cancelada')
      break
    }
    lastCreds = creds
    pending.push({ check, creds })
  }

  const results = await Promise.all(
    pending.map(({ check, creds }) =>
      queueSshRevision(check, creds).catch((e) => {
        showToast(`${check.server?.name}: ${e.response?.data?.error || e.message || 'Error SSH'}`)
        return false
      }),
    ),
  )
  const ok = results.filter(Boolean).length
  const err = results.length - ok
  if (ok || err) {
    showToast(`SSH terminado: ${ok} OK, ${err} errores`)
  }
  sshAllBusy.value = false
}

async function downloadPdf() {
  pdfBusy.value = true
  error.value = ''
  try {
    await downloadChecklistPdf(date.value)
  } catch (e) {
    error.value = e.message || 'No se pudo generar el PDF'
  } finally {
    pdfBusy.value = false
  }
}

function formatBackupDate(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

onMounted(loadReview)
onBeforeUnmount(() => {
  disposed = true
  clearTimeout(toastTimer)
})
watch(date, loadReview)
watch(() => route.query.fecha, (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value !== date.value) {
    date.value = value
  }
})
</script>

<template>
  <div>
    <div class="top">
      <div>
        <h1>Checklist de servidores</h1>
        <p>{{ loading ? 'Cargando…' : (review?.date || date) }}</p>
      </div>
      <div class="toolbar date">
        <input v-model="date" type="date">
        <button type="button" class="btn" :disabled="pingAllBusy || loading" @click="pingAll">
          {{ pingAllBusy ? 'Ping…' : 'Ping a todos' }}
        </button>
        <button type="button" class="btn primary" :disabled="sshAllBusy || loading" @click="sshAll">
          {{ sshAllBusy ? 'Revisando…' : 'Revisar por SSH' }}
        </button>
        <button type="button" class="btn" :disabled="pdfBusy || loading" @click="downloadPdf">
          {{ pdfBusy ? 'PDF…' : 'Descargar PDF' }}
        </button>
      </div>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="review" class="stats">
      <div class="stat">
        <span>Avance</span>
        <b>{{ resumen.pct }}%</b>
        <div class="bar"><i :style="{ width: resumen.pct + '%' }" /></div>
      </div>
      <div class="stat ok"><span>Completos</span><b>{{ resumen.ok }}</b></div>
      <div class="stat warn"><span>En proceso</span><b>{{ resumen.parcial }}</b></div>
      <div class="stat bad"><span>Con falla</span><b>{{ resumen.falla }}</b></div>
    </div>

    <div class="grid">
      <article
        v-for="check in checks"
        :key="check.id"
        class="card"
        :class="estado(check)"
      >
        <div class="head">
          <div>
            <h2>
              <span class="led" :class="estado(check) === 'ok' ? 'ok' : (estado(check) === 'falla' ? 'bad' : 'warn')" />
              {{ check.server?.name }}
            </h2>
            <div class="meta">
              {{ check.server?.system }}
              <span v-if="hostOf(check)"> · <span class="ip">{{ hostOf(check) }}</span></span>
              <span v-if="check.server?.typical_time"> · cron ~{{ check.server.typical_time }}</span>
            </div>
          </div>
          <div class="toolbar">
            <button
              v-if="hostOf(check)"
              type="button"
              class="btn"
              :class="pingButtonClass(check)"
              :disabled="pingUi[check.id]?.busy"
              @click="pingCheck(check)"
            >{{ pingButtonText(check) }}</button>
            <button
              v-if="canSsh(check)"
              type="button"
              class="btn"
              :disabled="sshBusy[check.id]"
              @click="sshCheck(check)"
            >{{ sshBusy[check.id] ? 'SSH…' : sshLabel(check) }}</button>
          </div>
        </div>

        <div class="checks">
          <div class="check-box">
            <label>Servidor prendido</label>
            <div class="seg" title="Lo determina Ping / SSH; no se cambia a mano">
              <span :class="{ 'on-ok': check.powered_on === 'prendido' }">Prendido</span>
              <span :class="{ 'on-bad': check.powered_on === 'apagado' }">Apagado</span>
              <span :class="{ 'on-warn': check.powered_on === 'pending' }">Pendiente</span>
            </div>
          </div>
          <div class="check-box">
            <label>Montajes NetApp</label>
            <div class="seg" title="Lo determina la revisión SSH; no se cambia a mano">
              <span :class="{ 'on-ok': check.mounts_status === 'ok' }">Montados</span>
              <span :class="{ 'on-bad': check.mounts_status === 'falla' }">Falla</span>
              <span :class="{ 'on-na': check.mounts_status === 'na' }">N/A</span>
              <span :class="{ 'on-warn': check.mounts_status === 'pending' }">Pendiente</span>
            </div>
          </div>
          <div class="check-box">
            <label>Respaldo</label>
            <div class="seg" title="Lo determina la revisión SSH; no se cambia a mano">
              <span :class="{ 'on-ok': check.backup === 'exitoso' }">Exitoso</span>
              <span :class="{ 'on-bad': check.backup === 'fallido' }">Fallido</span>
              <span :class="{ 'on-na': check.backup === 'na' }">No aplica</span>
              <span :class="{ 'on-warn': check.backup === 'pending' }">Pendiente</span>
            </div>
          </div>
        </div>

        <div v-if="check.server?.mounts?.length" class="mounts">
          <span
            v-for="mount in check.server.mounts"
            :key="mount.id"
            class="mount"
            :class="{ on: check.mounts_details?.[mount.path] }"
          >{{ mount.path }}</span>
        </div>

        <p v-if="check.review_result || check.reviewed_by" class="resultado-revision">
          <template v-if="check.review_result">
            <span>Revisión SSH</span> {{ check.review_result }}
          </template>
          <template v-if="check.reviewed_by">
            <span>Revisó</span> {{ check.reviewed_by }}
          </template>
        </p>

        <details class="more">
          <summary>Detalle del respaldo</summary>
          <div class="fields">
            <div>
              <label>Hora gen. archivo (mtime real)</label>
              <input readonly :value="check.generated_at || ''" placeholder="Hora real del archivo (mtime)">
            </div>
            <div>
              <label>Fecha respaldo</label>
              <input readonly :value="formatBackupDate(check.backup_date)">
            </div>
            <div>
              <label>Tamaño archivo</label>
              <input readonly :value="check.size || ''" placeholder="Desde revisión SSH">
            </div>
            <div class="span3">
              <label>¿Falló? Causa raíz / diagnóstico</label>
              <input
                :value="check.root_cause || ''"
                @change="patchCheck(check, { root_cause: $event.target.value })"
              >
            </div>
          </div>
        </details>

        <div class="day-note">
          <label>Notas del día</label>
          <textarea
            class="obs"
            :value="check.observations || ''"
            placeholder="Incidentes, pendientes, llamadas de este servidor…"
            rows="2"
            @change="patchCheck(check, { observations: $event.target.value })"
          />
        </div>
      </article>
    </div>

    <SshModal
      :open="sshModal.open"
      :label="sshModal.check?.server?.name || 'Servidor'"
      :host="sshModal.check ? hostOf(sshModal.check) : ''"
      :server-user="sshModal.check?.server?.username || ''"
      :team-users="sshModalTeamUsers(sshModal.check)"
      @close="closeSshModal"
      @submit="submitSshModal"
    />

    <div class="toast" :class="{ show: !!toast }">{{ toast }}</div>
  </div>
</template>
