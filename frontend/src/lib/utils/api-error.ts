import { AxiosError } from 'axios'

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail.map((e: { msg: string }) => e.msg).join(' · ')
    }
    if (error.response?.status === 422) return 'Données invalides'
    if (error.response?.status === 401) return 'Email ou mot de passe incorrect'
    if (error.response?.status === 403) return 'Accès non autorisé'
    if (error.response?.status === 500) return 'Erreur serveur, réessayez plus tard'
    if (!error.response) return 'Impossible de joindre le serveur'
  }
  return 'Une erreur inattendue est survenue'
}