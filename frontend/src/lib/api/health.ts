import { apiClient } from './client'

export async function checkHealth() {
  const { data } = await apiClient.get<{ status: string }>('/health/live')
  return data
}

export interface ReadinessResponse {
  status: 'ready' | 'not_ready'
  checks: Record<string, string>
}

// /health/ready répond 503 quand une dépendance est down — on veut lire le
// corps de la réponse dans les deux cas, pas juste catch une erreur axios.
export async function checkReadiness() {
  const { data } = await apiClient.get<ReadinessResponse>('/health/ready', {
    validateStatus: () => true,
  })
  return data
}
