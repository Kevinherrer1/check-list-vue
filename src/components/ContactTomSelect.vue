<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TomSelect from 'tom-select'

const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Escriba nombre o correo…' },
  multiple: { type: Boolean, default: false },
  allowCreate: { type: Boolean, default: true },
})

const emit = defineEmits(['update:modelValue'])
const el = ref(null)
let ts = null
let syncing = false

function asOptions(list) {
  return (list || [])
    .filter((c) => c?.email)
    .map((c) => ({
      value: String(c.email).trim(),
      text: `${c.nombre || c.email} (${c.email})`,
      nombre: c.nombre || c.email,
      email: String(c.email).trim(),
    }))
}

function splitValue(raw) {
  return String(raw || '')
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function emitValue(value) {
  const next = Array.isArray(value) ? value.filter(Boolean).join(', ') : String(value || '')
  if (next === (props.modelValue || '')) return
  emit('update:modelValue', next)
}

function bindTomSelect() {
  if (!el.value || ts) return
  ts = new TomSelect(el.value, {
    valueField: 'value',
    labelField: 'text',
    searchField: ['nombre', 'email', 'text'],
    options: asOptions(props.options),
    maxOptions: 80,
    maxItems: props.multiple ? 25 : 1,
    highlight: true,
    openOnFocus: true,
    closeAfterSelect: !props.multiple,
    hideSelected: true,
    dropdownParent: 'body',
    placeholder: props.placeholder,
    create: props.allowCreate
      ? (input) => {
          const email = String(input || '').trim()
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false
          return { value: email, text: email, nombre: email, email }
        }
      : false,
    persist: false,
    plugins: ['dropdown_input', 'clear_button', 'remove_button'],
    render: {
      option(data, escape) {
        return `<div class="ts-contact-opt"><strong>${escape(data.nombre || data.value)}</strong><span>${escape(data.email || data.value)}</span></div>`
      },
      item(data, escape) {
        const label = data.nombre && data.nombre !== data.email
          ? `${data.nombre}`
          : (data.email || data.value)
        return `<div>${escape(label)}</div>`
      },
      no_results(_data, escape) {
        return `<div class="no-results">Sin coincidencias para “${escape(_data.input || '')}”</div>`
      },
    },
    onChange(value) {
      if (syncing) return
      emitValue(value)
    },
  })
  applyValue(props.modelValue)
}

function applyValue(raw) {
  if (!ts) return
  const wanted = splitValue(raw)
  wanted.forEach((email) => {
    if (!ts.options[email]) {
      ts.addOption({ value: email, text: email, nombre: email, email })
    }
  })
  syncing = true
  ts.setValue(props.multiple ? wanted : (wanted[0] || ''), true)
  syncing = false
}

watch(
  () => props.options,
  (list) => {
    if (!ts) return
    const current = ts.getValue()
    ts.clearOptions()
    ts.addOptions(asOptions(list))
    ts.refreshOptions(false)
    syncing = true
    ts.setValue(current, true)
    syncing = false
  },
  { deep: true },
)

watch(
  () => props.modelValue,
  (raw) => {
    if (!ts) return
    const current = ts.getValue()
    const now = Array.isArray(current) ? current.join(', ') : String(current || '')
    if (now === (raw || '')) return
    applyValue(raw)
  },
)

onMounted(bindTomSelect)
onBeforeUnmount(() => {
  ts?.destroy()
  ts = null
})
</script>

<template>
  <select ref="el" :multiple="multiple" autocomplete="off" />
</template>
