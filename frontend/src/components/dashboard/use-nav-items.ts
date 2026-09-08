'use client'

import { useUser } from '@/lib/stores/auth.store'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import {
  NAV_ITEMS, STAFF_BASELINE_ITEMS, STAFF_DASHBOARD_ITEM, STAFF_MODULE_ITEMS, STAFF_SETTINGS_ITEM,
  type NavItem,
} from './nav-items'

/** Nav items effectifs pour l'utilisateur connecté — même logique pour la
 * sidebar de bureau et le tiroir de navigation mobile (une seule source de
 * vérité, pas de divergence entre les deux). */
export function useNavItems(): NavItem[] {
  const user = useUser()
  const { permissions } = useMyPermissions()

  if (!user) return []

  if (user.role === 'staff') {
    const modules = STAFF_MODULE_ITEMS.filter((m) => m.permissions.some((p) => permissions.has(p)))
    return [STAFF_DASHBOARD_ITEM, ...STAFF_BASELINE_ITEMS, ...modules, STAFF_SETTINGS_ITEM]
  }

  return NAV_ITEMS[user.role]
}
