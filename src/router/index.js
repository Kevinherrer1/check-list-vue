import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import AppLayout from '../layouts/AppLayout.vue'
import HoyView from '../views/HoyView.vue'
import ServersView from '../views/ServersView.vue'
import ReportsView from '../views/ReportsView.vue'
import ReportPrintView from '../views/ReportPrintView.vue'

const routes = [
  { path: '/login', component: LoginView },
  { path: '/dashboard', redirect: '/' },
  { path: '/hoy', redirect: '/' },
  {
    path: '/reportes/imprimir/:fecha',
    component: ReportPrintView,
    meta: { auth: true },
  },
  {
    path: '/',
    component: AppLayout,
    meta: { auth: true },
    children: [
      {
        path: '',
        component: HoyView,
        meta: { auth: true },
      },
      {
        path: 'servidores',
        component: ServersView,
        meta: { auth: true },
      },
      {
        path: 'reportes',
        component: ReportsView,
        meta: { auth: true },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const token = localStorage.getItem('token')
  const needsAuth = to.matched.some((record) => record.meta.auth)
  if (needsAuth && !token) {
    return '/login'
  }
  if (to.path === '/login' && token) {
    return '/'
  }
})

export default router
