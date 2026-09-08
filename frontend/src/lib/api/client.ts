import axios, { type AxiosError } from 'axios'
import { useAuthStore } from '@/lib/stores/auth.store'

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 10_000,
})

// Injecte le token JWT à chaque requête
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Refresh automatique sur 401
let isRefreshing = false
let queue: Array<(token: string) => void> = []

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as typeof error.config & { _retry?: boolean }

    if (error.response?.status !== 401 || original?._retry) {
      return Promise.reject(error)
    }

    // Si un refresh est déjà en cours, mettre en file d'attente
    if (isRefreshing) {
      return new Promise((resolve) => {
        queue.push((token) => {
          original!.headers!.Authorization = `Bearer ${token}`
          resolve(apiClient(original!))
        })
      })
    }

    original._retry = true
    isRefreshing = true

    try {
      const refreshToken = useAuthStore.getState().refreshToken
      if (!refreshToken) throw new Error('No refresh token')

      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/refresh`,
        { refresh_token: refreshToken }
      )

      useAuthStore.getState().setSession(data, useAuthStore.getState().user!)
      queue.forEach((cb) => cb(data.access_token))
      queue = []

      original!.headers!.Authorization = `Bearer ${data.access_token}`
      return apiClient(original!)
    } catch {
      useAuthStore.getState().clearSession()
      window.location.href = '/auth/login'
      return Promise.reject(error)
    } finally {
      isRefreshing = false
    }
  }
)