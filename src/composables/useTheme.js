import { ref } from 'vue'

const KEY = 'bitacora_theme'
const theme = ref(localStorage.getItem(KEY) === 'light' ? 'light' : 'dark')

function apply(value) {
  document.documentElement.dataset.theme = value
  localStorage.setItem(KEY, value)
}

apply(theme.value)

export function useTheme() {
  function setTheme(value) {
    theme.value = value
    apply(value)
  }

  function toggle() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  return { theme, setTheme, toggle }
}
