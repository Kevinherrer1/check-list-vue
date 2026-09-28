<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api/axios'
import { downloadChecklistPdf, downloadReportCsv } from '../composables/useChecklistPdf'
import ContactTomSelect from '../components/ContactTomSelect.vue'

function monthStart() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
}

function todayYmd() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const router = useRouter()
const from = ref(monthStart())
const to = ref(todayYmd())
const pdfDate = ref(todayYmd())
const report = ref(null)
const error = ref('')
const loading = ref(false)
const csvBusy = ref(false)
const pdfBusy = ref(false)
const mailBusy = ref(false)
const mailFlash = ref(null)
const mail = ref({
  enabled: false,
  remitentes: [],
  contactos: [],
  ldap: { ok: false, count: 0, error: '' },
  to_default: '',
  cc_default: '',
  asunto: '',
  mensaje: '',
})
const mailForm = ref({
  fecha: todayYmd(),
  remitente_id: '',
  smtp_password: '',
  to: '',
  cc: '',
  asunto: '',
  mensaje: '',
})

const totals = computed(() => report.value?.totals || {
  pct_ok: 0, ok: 0, falla: 0, pendiente: 0, parcial: 0, dias: 0, total: 0,
})

const agendaHint = computed(() => {
  const ldap = mail.value.ldap || {}
  const n = mail.value.contactos?.length || 0
  if (ldap.ok) {
    return `Agenda LDAP: ${ldap.count} contactos (lista ${n}). Escriba en Para/CC para filtrar.`
  }
  if (ldap.error) return ldap.error
  return n ? `${n} contactos. Escriba en Para/CC para filtrar.` : 'Sin contactos: puede escribir el correo a mano.'
})

async function load() {
  error.value = ''
  loading.value = true
  try {
    const { data } = await api.get('/reports', { params: { from: from.value, to: to.value } })
    report.value = data
    pdfDate.value = data.to || to.value
    mailForm.value.fecha = pdfDate.value
    await loadMailOptions()
  } catch (e) {
    error.value = e.response?.data?.message || 'No se pudo cargar el reporte'
    report.value = null
  } finally {
    loading.value = false
  }
}

async function exportCsv() {
  csvBusy.value = true
  error.value = ''
  try {
    await downloadReportCsv(from.value, to.value)
  } catch (e) {
    error.value = e.message || 'No se pudo exportar el CSV'
  } finally {
    csvBusy.value = false
  }
}

async function downloadPdf(ymd) {
  pdfBusy.value = true
  error.value = ''
  try {
    await downloadChecklistPdf(ymd)
  } catch (e) {
    error.value = e.message || 'No se pudo generar el PDF'
  } finally {
    pdfBusy.value = false
  }
}

function dayTone(day) {
  if (day.falla > 0) return 'falla'
  if (day.ok === day.total && day.total > 0) return 'ok'
  return 'warn'
}

async function loadMailOptions() {
  try {
    const { data } = await api.get('/reports/mail-options', { params: { fecha: mailForm.value.fecha } })
    mail.value = data
    mailForm.value.asunto = data.asunto || mailForm.value.asunto
    mailForm.value.mensaje = data.mensaje || mailForm.value.mensaje
    if (!mailForm.value.to && data.to_default) mailForm.value.to = data.to_default
    if (!mailForm.value.cc && data.cc_default) mailForm.value.cc = data.cc_default
  } catch {
    mail.value.enabled = false
  }
}

function applyRemitente() {
  const rem = mail.value.remitentes.find((r) => r.id === mailForm.value.remitente_id)
  if (!rem) return
  mailForm.value.mensaje = mailForm.value.mensaje.replaceAll('{remitente}', rem.nombre)
}

async function sendMail() {
  mailBusy.value = true
  mailFlash.value = null
  error.value = ''
  if (!String(mailForm.value.to || '').trim()) {
    mailBusy.value = false
    mailFlash.value = { ok: false, text: 'Elija al menos un destinatario en Para.' }
    return
  }
  try {
    const { data } = await api.post('/reports/send-pdf', {
      fecha: mailForm.value.fecha,
      remitente_id: mailForm.value.remitente_id,
      smtp_password: mailForm.value.smtp_password,
      to: mailForm.value.to,
      cc: mailForm.value.cc,
      asunto: mailForm.value.asunto,
      mensaje: mailForm.value.mensaje,
    })
    mailForm.value.smtp_password = ''
    mailFlash.value = { ok: true, text: data.message || `Enviado a ${data.to}` }
  } catch (e) {
    mailFlash.value = {
      ok: false,
      text: e.response?.data?.error || e.response?.data?.message || 'No se pudo enviar el correo',
    }
  } finally {
    mailBusy.value = false
  }
}

watch(() => mailForm.value.fecha, loadMailOptions)
onMounted(load)
</script>

<template>
  <div class="reports-page">
    <div class="top">
      <div>
        <h1>Reportes</h1>
        <p>Resumen por rango, por servidor e impresión del checklist diario.</p>
      </div>
    </div>

    <form class="toolbar report-filters card" @submit.prevent="load">
      <label>Desde <input v-model="from" type="date"></label>
      <label>Hasta <input v-model="to" type="date"></label>
      <button type="submit" class="btn primary" :disabled="loading">Aplicar</button>
      <button type="button" class="btn" :disabled="csvBusy || loading" @click="exportCsv">
        {{ csvBusy ? 'CSV…' : 'CSV del rango' }}
      </button>
    </form>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="stats reports-stats">
      <div class="stat">
        <span>Avance OK</span>
        <b>{{ totals.pct_ok }}%</b>
        <div class="bar"><i :style="{ width: totals.pct_ok + '%' }" /></div>
      </div>
      <div class="stat ok"><span>Chequeos OK</span><b>{{ totals.ok }}</b></div>
      <div class="stat bad"><span>Con falla</span><b>{{ totals.falla }}</b></div>
      <div class="stat warn"><span>Pend. / parcial</span><b>{{ (totals.pendiente || 0) + (totals.parcial || 0) }}</b></div>
      <div class="stat"><span>Días</span><b>{{ totals.dias }}</b></div>
    </div>

    <div class="report-grid">
      <section class="card">
        <h2>1. Por día</h2>
        <p class="hint">{{ report?.from_label || from }} — {{ report?.to_label || to }}</p>
        <table class="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>OK</th>
              <th>Fallas</th>
              <th>Pend.</th>
              <th>Parcial</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!report?.days?.length">
              <td colspan="7" class="hint">{{ loading ? 'Cargando…' : 'No hay revisiones en ese rango.' }}</td>
            </tr>
            <tr v-for="day in report?.days || []" :key="day.fecha" :class="'row-' + dayTone(day)">
              <td>{{ day.fecha_label }}</td>
              <td>{{ day.ok }}</td>
              <td>{{ day.falla }}</td>
              <td>{{ day.pendiente }}</td>
              <td>{{ day.parcial }}</td>
              <td>{{ day.total }}</td>
              <td class="report-actions">
                <button type="button" class="btn" @click="router.push({ path: '/', query: { fecha: day.fecha } })">Abrir</button>
                <button type="button" class="btn" :disabled="pdfBusy" @click="downloadPdf(day.fecha)">PDF</button>
                <button type="button" class="btn" @click="router.push(`/reportes/imprimir/${day.fecha}`)">Vista</button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>2. Por servidor</h2>
        <p class="hint">Ordenado por más fallas en el periodo.</p>
        <table class="table">
          <thead>
            <tr>
              <th>Servidor</th>
              <th>Días</th>
              <th>OK</th>
              <th>Fallas</th>
              <th>Respaldo fallido</th>
              <th>Montaje falla</th>
              <th>Apagado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!report?.servers?.length">
              <td colspan="7" class="hint">{{ loading ? 'Cargando…' : 'Sin datos en el rango.' }}</td>
            </tr>
            <tr v-for="server in report?.servers || []" :key="server.server_id">
              <td>
                <strong>{{ server.nombre }}</strong>
                <div class="meta mono">{{ server.ip }}</div>
              </td>
              <td>{{ server.dias }}</td>
              <td>{{ server.ok }}</td>
              <td>{{ server.falla }}</td>
              <td>{{ server.fallas_respaldo }}</td>
              <td>{{ server.fallas_montaje }}</td>
              <td>{{ server.apagados }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <section class="card card-spaced">
      <h2>3. PDF / imprimible</h2>
      <p class="hint"><strong>Descargar PDF</strong> guarda el archivo (no abre la impresora). La vista previa es solo para revisar en pantalla.</p>
      <div class="toolbar">
        <label class="report-date-label">Fecha <input v-model="pdfDate" type="date"></label>
        <button type="button" class="btn primary" :disabled="pdfBusy" @click="downloadPdf(pdfDate)">
          {{ pdfBusy ? 'PDF…' : 'Descargar PDF' }}
        </button>
        <button type="button" class="btn" @click="router.push(`/reportes/imprimir/${pdfDate}`)">Vista previa</button>
      </div>
    </section>

    <section class="card card-spaced">
      <h2>4. Enviar PDF por correo</h2>
      <p v-if="mailFlash?.ok" class="hint hint-ok">
        <strong>Correo aceptado por el servidor CVG.</strong> {{ mailFlash.text }}. Revise Thunderbird (bandeja y spam) en unos segundos.
      </p>
      <p v-else-if="mailFlash && !mailFlash.ok" class="hint hint-bad">
        <strong>No se envió:</strong> {{ mailFlash.text }}
      </p>
      <p v-if="!mail.enabled" class="hint">
        Configure los remitentes del equipo en <code>config/bitacora_correo.php</code>.
        Las claves no van en el archivo: cada uno las digita al enviar.
      </p>
      <template v-else>
        <p class="hint">
          Cada revisor elige <strong>quién envía</strong> (su casilla CVG), digita <strong>su</strong> clave
          y el PDF se adjunta solo. La clave no se guarda. Para/CC salen del LDAP de Thunderbird
          (<code>pzosdgstdeb7</code>) cuando hay red CVG (VPN apagada).
        </p>
        <p class="hint" :class="mail.ldap?.ok ? 'hint-ok' : 'hint-warn'">
          {{ agendaHint }}
        </p>
        <form class="form-grid" autocomplete="off" @submit.prevent="sendMail">
          <div>
            <label>Fecha del checklist</label>
            <input v-model="mailForm.fecha" type="date" required>
          </div>
          <div>
            <label>Quién envía</label>
            <select v-model="mailForm.remitente_id" required @change="applyRemitente">
              <option value="">— Seleccione —</option>
              <option v-for="rem in mail.remitentes" :key="rem.id" :value="rem.id">
                {{ rem.nombre }} ({{ rem.from }})
              </option>
            </select>
          </div>
          <div>
            <label>Su clave de correo (Thunderbird)</label>
            <input v-model="mailForm.smtp_password" type="password" required placeholder="Solo para este envío" autocomplete="current-password">
          </div>
          <div class="full">
            <label>Para (destinatarios)</label>
            <ContactTomSelect
              v-model="mailForm.to"
              :options="mail.contactos"
              placeholder="Escriba nombre o correo…"
              multiple
            />
          </div>
          <div class="full">
            <label>CC (opcional)</label>
            <ContactTomSelect
              v-model="mailForm.cc"
              :options="mail.contactos"
              placeholder="Copia: escriba para buscar…"
              multiple
            />
          </div>
          <div>
            <label>Asunto</label>
            <input v-model="mailForm.asunto" type="text">
          </div>
          <div class="full">
            <label>Mensaje</label>
            <textarea v-model="mailForm.mensaje" rows="4" />
            <p class="hint">El saludo cambia solo según la hora (días / tardes / noches).</p>
          </div>
          <div class="full toolbar">
            <button type="submit" class="btn primary" :disabled="mailBusy">
              {{ mailBusy ? 'Enviando…' : 'Generar PDF y enviar' }}
            </button>
            <button type="button" class="btn" :disabled="pdfBusy" @click="downloadPdf(mailForm.fecha)">Solo descargar PDF</button>
          </div>
        </form>
      </template>
    </section>
  </div>
</template>
