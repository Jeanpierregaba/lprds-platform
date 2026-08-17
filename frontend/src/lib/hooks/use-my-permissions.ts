'use client'

import { useQuery } from '@tanstack/react-query'
import { rbacApi } from '@/lib/api/rbac.api'
import { useUser } from '@/lib/stores/auth.store'

/** Permissions RBAC effectives de l'utilisateur connecté — admin (tout) ou staff (ses rôles actifs). */
export function useMyPermissions() {
  const user = useUser()
  const enabled = user?.role === 'staff' || user?.role === 'admin'

  const { data, isLoading } = useQuery({
    queryKey: ['rbac', 'me'],
    queryFn: () => rbacApi.getMyPermissions().then((r) => r.data),
    enabled,
  })

  return { permissions: new Set(data?.permissions ?? []), isLoading: enabled && isLoading }
}
