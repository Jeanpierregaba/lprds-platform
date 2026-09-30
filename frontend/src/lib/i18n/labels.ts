'use client'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

/**
 * Libellés des énumérations, traduits.
 *
 * Remplace les tables figées de `src/types/*.ts` (`ROLE_LABELS`,
 * `STAFF_TYPE_LABELS`, `WEEKDAY_LABELS`…), qui portaient du français en dur.
 * Les codes eux-mêmes restent dans `src/types` : ils sont la donnée échangée
 * avec le backend et ne changent jamais de langue — c'est le principe déjà
 * posé côté serveur pour `PermissionCode` et le vocabulaire des rapports.
 *
 * Deux formes, selon l'usage réel du code appelant :
 *  - `useLabel(groupe)` rend une fonction, pour afficher UNE valeur ;
 *  - `useLabelMap(groupe, valeurs)` rend un objet, pour les listes déroulantes
 *    qui parcourent `Object.entries(...)`.
 */

export type EnumGroup =
  | 'roles'
  | 'staffTypes'
  | 'weekdays'
  | 'mealSlots'
  | 'reportTypes'
  | 'reportStatus'
  | 'reportDomains'
  | 'articleStatus'
  | 'gallerySources'
  | 'gallerySourceBadges'
  | 'lendingStatus'
  | 'attendanceStatus'
  | 'translationStatus'

/** Traduit une valeur d'énumération. Une valeur inconnue du catalogue est
 *  rendue telle quelle plutôt que de faire échouer l'affichage — le backend
 *  peut avoir gagné un code que le frontend ne connaît pas encore. */
export function useLabel(group: EnumGroup): (value: string) => string {
  const t = useTranslations(`enums.${group}`)
  return useMemo(
    () => (value: string) => (t.has(value) ? t(value) : value),
    [t],
  )
}

/** Table `{ code: libellé }`, dans l'ordre des `values` fournies. */
export function useLabelMap<T extends string>(
  group: EnumGroup,
  values: readonly T[],
): Record<T, string> {
  const label = useLabel(group)
  return useMemo(
    () => Object.fromEntries(values.map((v) => [v, label(v)])) as Record<T, string>,
    [label, values],
  )
}
