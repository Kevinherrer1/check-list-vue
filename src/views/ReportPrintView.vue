<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '../api/axios'
import {
  cortoValor,
  downloadChecklistPdf,
  estadoGeneral,
  etiquetaEstado,
  fechaEs,
  notaPrint,
} from '../composables/useChecklistPdf'

const route = useRoute()
const router = useRouter()
const review = ref(null)
const error = ref('')
const loading = ref(false)
const pdfBusy = ref(false)

const fecha = computed(() => String(route.params.fecha || ''))

const checks = computed(() => review.value?.checks ?? [])

const resumen = computed(() => {
  const rows = checks.value
  let ok = 0
  let falla = 0
  let pend = 0
  let parcial = 0
  for (const check of rows) {
    const g = estadoGeneral(check)
    if (g === 'ok') ok++
    else if (g === 'falla') falla++
    else if (g === 'parcial') parcial++
    else pend++
  }
  return { ok, falla, pend, parcial, total: rows.length }
})

const responsable = computed(() => {
  const value = String(review.value?.responsible || '').trim()
  return value || '—'
})

async function load() {
  error.value = ''
  loading.value = true
  try {
    const { data } = await api.get(`/reviews/${fecha.value}`)
    review.value = data
  } catch (e) {
    error.value = e.response?.data?.message || 'No se pudo cargar el día'
    review.value = null
  } finally {
    loading.value = false
  }
}

async function downloadPdf() {
  pdfBusy.value = true
  try {
    await downloadChecklistPdf(fecha.value)
  } catch (e) {
    error.value = e.message || 'No se pudo generar el PDF'
  } finally {
    pdfBusy.value = false
  }
}

onMounted(load)
watch(fecha, load)
</script>

<template>
  <div class="print-page">
    <div class="print-toolbar no-print">
      <button type="button" class="btn" @click="router.push('/reportes')">← Reportes</button>
      <button type="button" class="btn" @click="router.push({ path: '/', query: { fecha } })">Abrir día</button>
      <button type="button" class="btn primary" :disabled="pdfBusy" @click="downloadPdf">
        {{ pdfBusy ? 'PDF…' : 'Descargar PDF' }}
      </button>
      <button type="button" class="btn" @click="window.print()">Imprimir en papel…</button>
    </div>
    <p class="print-hint no-print">
      Para guardar el archivo use <strong>Descargar PDF</strong> (recomendado).<br>
      <strong>Imprimir en papel…</strong> abre el diálogo del navegador. Eso no es un fallo de la bitácora.
    </p>
    <p v-if="error" class="error no-print">{{ error }}</p>
    <article v-if="review" class="print-sheet">
      <header class="print-head">
        <div>
          <p class="print-brand">Bitácora DBA</p>
          <h1>Checklist de respaldos</h1>
          <p>{{ fechaEs(fecha) }} · responsable {{ responsable }}</p>
        </div>
        <div class="print-stats">
          <span>OK {{ resumen.ok }}</span>
          <span>Fallas {{ resumen.falla }}</span>
          <span>Pend. {{ resumen.pend + resumen.parcial }}</span>
          <span>Total {{ resumen.total }}</span>
        </div>
      </header>
      <table class="print-table">
        <colgroup>
          <col class="c-serv">
          <col class="c-ip">
          <col class="c-flag">
          <col class="c-flag">
          <col class="c-flag">
          <col class="c-hora">
          <col class="c-tam">
          <col class="c-est">
          <col class="c-nota">
        </colgroup>
        <thead>
          <tr>
            <th>Servidor</th>
            <th>IP</th>
            <th>On</th>
            <th>Mont.</th>
            <th>Resp.</th>
            <th>Hora</th>
            <th>Tam.</th>
            <th>Est.</th>
            <th>Resumen</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="check in checks" :key="check.id" :class="'st-' + estadoGeneral(check)">
            <td>{{ check.server?.name }}</td>
            <td class="mono">{{ check.server?.ip || check.server?.hostname }}</td>
            <td class="center">{{ cortoValor(check.powered_on) }}</td>
            <td class="center">{{ cortoValor(check.mounts_status) }}</td>
            <td class="center">{{ cortoValor(check.backup) }}</td>
            <td class="mono">{{ check.generated_at }}</td>
            <td class="mono">{{ check.size }}</td>
            <td class="center"><strong>{{ etiquetaEstado(estadoGeneral(check)) }}</strong></td>
            <td class="nota">{{ notaPrint(check) }}</td>
          </tr>
          <tr v-if="!checks.length">
            <td colspan="9">{{ loading ? 'Cargando…' : 'Sin chequeos para esta fecha.' }}</td>
          </tr>
        </tbody>
      </table>
      <footer class="print-foot">
        Generado {{ new Date().toLocaleString('es-VE') }} · Orientación horizontal recomendada
      </footer>
    </article>
  </div>
</template>
