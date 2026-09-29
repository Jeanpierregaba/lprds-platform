'use client'

import { useQuery } from '@tanstack/react-query'
import { useLocale } from 'next-intl'
import { reportsApi } from '@/lib/api/reports.api'

/**
 * Vocabulaire des rapports (listes déroulantes et cases à cocher).
 *
 * Seul libellé du projet qui vient encore du backend : les mêmes chaînes
 * alimentent le PDF du bulletin annuel, et une seconde copie côté frontend
 * finirait par diverger. Les libellés RBAC, eux, sont purement locaux.
 *
 * ⚠️ La locale fait partie de la clé de cache : sans elle, un changement de
 * langue continuerait de servir la réponse précédente jusqu'à expiration.
 */
export function useReportVocabulary() {
  const locale = useLocale()

  return useQuery({
    queryKey: ['reports', 'vocabulary', locale],
    queryFn: () => reportsApi.getVocabulary().then((r) => r.data),
  })
}
