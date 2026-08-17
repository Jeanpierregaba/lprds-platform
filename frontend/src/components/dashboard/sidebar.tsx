'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore, useUser } from '@/lib/stores/auth.store'
import { authApi } from '@/lib/api/auth.api'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import {
  NAV_ITEMS, STAFF_BASELINE_ITEMS, STAFF_DASHBOARD_ITEM, STAFF_MODULE_ITEMS, STAFF_SETTINGS_ITEM,
  type NavItem,
} from './nav-items'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const user = useUser()
  const pathname = usePathname()
  const router = useRouter()
  const { refreshToken, clearSession } = useAuthStore()
  const { permissions } = useMyPermissions()

  if (!user) return null

  let items: NavItem[] = NAV_ITEMS[user.role]
  if (user.role === 'staff') {
    const modules = STAFF_MODULE_ITEMS.filter((m) => m.permissions.some((p) => permissions.has(p)))
    items = [STAFF_DASHBOARD_ITEM, ...STAFF_BASELINE_ITEMS, ...modules, STAFF_SETTINGS_ITEM]
  }

  const handleLogout = async () => {
    try {
      if (refreshToken) await authApi.logout(refreshToken)
    } catch {
      // best-effort — on nettoie la session locale même si l'appel échoue
    } finally {
      clearSession()
      router.push('/auth/login')
    }
  }

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-background md:flex md:flex-col">
      <div className="flex h-14 items-center border-b border-border px-4">
        <span className="text-sm font-semibold">
          {process.env.NEXT_PUBLIC_APP_NAME ?? 'LPRDS'}
        </span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={() => {
            handleLogout().catch(() => toast.error('Erreur lors de la déconnexion'))
          }}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-destructive transition-colors outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <LogOut className="size-4" />
          Se déconnecter
        </button>
      </div>
    </aside>
  )
}
