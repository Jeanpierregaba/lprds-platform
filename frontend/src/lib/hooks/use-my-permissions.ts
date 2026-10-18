'use client'

import { useQuery } from '@tanstack/react-query'
import { rbacApi } from '@/lib/api/rbac.api'
import { useUser } from '@/lib/stores/auth.store'
import type { PermissionCode } from '@/types/rbac'

/**
 * Permissions RBAC effectives de l'utilisateur connecté — admin (tout le
 * catalogue) ou staff (ses rôles ACTIFS).
 *
 * ⚠️ Le `Set` est typé `PermissionCode`, et ce n'est pas de la cosmétique :
 * en `Set<string>`, `permissions.has('children:wrtie')` type-checke, renvoie
 * toujours `false`, et masque le bouton POUR TOUJOURS. Rien ne l'attrapait —
 * ni `tsc`, ni le lint, ni un test — pour une trentaine de littéraux de
 * gating répartis dans l'interface. Vérifié : avec ce type, la même faute
 * échoue en TS2345.
 */
export function useMyPermissions() {
  const user = useUser()
  const enabled = user?.role === 'staff' || user?.role === 'admin'

  const { data, isLoading } = useQuery({
    queryKey: ['rbac', 'me'],
    queryFn: () => rbacApi.getMyPermissions().then((r) => r.data),
    enabled,
  })

  const permissions = new Set((data?.permissions ?? []) as PermissionCode[])
  return { permissions, isLoading: enabled && isLoading }
}
