'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { directoryApi } from '@/lib/api/directory.api'
import type { DirectoryUnit } from '@/types/directory'

/**
 * Départements et sections pour les SÉLECTEURS de périmètre.
 *
 * ⚠️ Passe par l'annuaire, pas par `/departments` et `/sections`, qui exigent
 * `organization:read` : six écrans d'autres modules proposent ce filtre, et
 * un staff à qui l'établissement n'a pas confié l'organisation voyait des
 * listes vides — sans rien qui l'explique.
 *
 * Les sections arrivent TOUTES en une fois et sont filtrées ici : changer de
 * département ne relance plus une requête, et la liste complète tient dans
 * une poignée de lignes.
 */
export function useDirectoryUnits(options?: { includeInactive?: boolean }) {
  const includeInactive = options?.includeInactive ?? false
  const { data, isLoading } = useQuery({
    queryKey: ['directory', 'units', { includeInactive }],
    queryFn: () =>
      directoryApi.listUnits({ include_inactive: includeInactive }).then((r) => r.data),
    // Un département ne se crée pas toutes les cinq minutes.
    staleTime: 5 * 60_000,
  })

  const departments = useMemo<DirectoryUnit[]>(() => data?.departments ?? [], [data])
  const sections = useMemo<DirectoryUnit[]>(() => data?.sections ?? [], [data])
  const groups = useMemo<DirectoryUnit[]>(() => data?.groups ?? [], [data])

  const sectionsOf = useMemo(
    () => (departmentId: string | null | undefined) =>
      departmentId ? sections.filter((s) => s.department_id === departmentId) : sections,
    [sections],
  )

  return { departments, sections, groups, sectionsOf, isLoading }
}
