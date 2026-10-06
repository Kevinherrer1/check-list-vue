import api from '../api/axios'

export function pdfFilename(ymd) {
  const [year, month, day] = String(ymd).split('-')
  return `Bitacora_Checklist_${day}${month}${year}.pdf`
}

export async function downloadChecklistPdf(ymd) {
  const { data } = await api.get(`/reviews/${ymd}/pdf`, { responseType: 'blob' })
  if (data.type && data.type.includes('json')) {
    const text = await data.text()
    const parsed = JSON.parse(text)
    throw new Error(parsed.message || parsed.error || 'No se pudo generar el PDF')
  }
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = pdfFilename(ymd)
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadReportCsv(from, to) {
  const { data } = await api.get('/reports/csv', {
    params: { from, to },
    responseType: 'blob',
  })
  const stamp = (value) => {
    const [y, m, d] = String(value).split('-')
    return `${d}${m}${y}`
  }
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = `Bitacora_Rango_${stamp(from)}_${stamp(to)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function fechaEs(ymd) {
  const dt = new Date(`${ymd}T12:00:00`)
  if (Number.isNaN(dt.getTime())) return ymd
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${dias[dt.getDay()]}, ${dt.getDate()} de ${meses[dt.getMonth()]} de ${dt.getFullYear()}`
}

export function cortoValor(v) {
  return ({
    prendido: 'Sí',
    apagado: 'No',
    pending: 'Pend.',
    pendiente: 'Pend.',
    exitoso: 'OK',
    fallido: 'Falla',
    ok: 'OK',
    falla: 'Falla',
    na: 'N/A',
  }[v] || v)
}

export function etiquetaEstado(g) {
  return ({ ok: 'OK', falla: 'Falla', parcial: 'Parcial' }[g] || 'Pendiente')
}

export function estadoGeneral(check) {
  const vals = [check.powered_on, check.mounts_status, check.backup].map((v) => (
    v === 'pending' ? 'pendiente' : v
  ))
  if (vals.some((v) => ['apagado', 'falla', 'fallido'].includes(v))) return 'falla'
  const pend = vals.filter((v) => v === 'pendiente').length
  const ok = vals.filter((v) => ['prendido', 'ok', 'exitoso', 'na'].includes(v)).length
  if (pend === 0) return 'ok'
  if (ok === 0) return 'pendiente'
  return 'parcial'
}

export function notaPrint(check, max = 400) {
  const causa = String(check.root_cause || '').trim()
  const auto = String(check.review_result || '').trim().replace(/\s+/g, ' ')
  const recortar = (s) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`)
  return recortar(causa || auto)
}
