'use client'

import { useTranslations } from 'next-intl'

import Image from 'next/image'
import { LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore, useUser } from '@/lib/stores/auth.store'
import { authApi } from '@/lib/api/auth.api'
import { useMessagingUnread } from '@/lib/messaging/use-messaging-unread'
import { NavList } from './nav-list'
import { useNavItems } from './use-nav-items'
import { useRouter } from '@/i18n/navigation'

export function Sidebar() {
  const t = useTranslations('common')
  const user = useUser()
  const router = useRouter()
  const items = useNavItems()
  const unreadMessages = useMessagingUnread()
  const { refreshToken, clearSession } = useAuthStore()

  if (!user) return null

  const handleLogout = async () => {
    try {
      if (refreshToken) await authApi.logout(refreshToken)
    } catch {
      // best-effort — on nettoie la session locale même si l'appel échoue
    } finally {
      clearSession()
      router.push('/')
    }
  }

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-accent md:flex md:flex-col">
      <div className="flex h-14 items-center border-b border-border px-4">
        <Image
          src="/images/marketing/logo.png"
          alt="Les Petits Rayons de Soleil"
          width={148}
          height={90}
          className="h-9 w-auto"
        />
      </div>
      <NavList
        items={items}
        badges={
          unreadMessages > 0
            ? {
                '/dashboard/admin/messaging': unreadMessages,
                '/dashboard/parent/messaging': unreadMessages,
              }
            : undefined
        }
      />
      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={() => {
            handleLogout().catch(() => toast.error(t('logoutError')))
          }}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-destructive transition-colors outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <LogOut className="size-4 shrink-0" />
          Se déconnecter
        </button>
      </div>
    </aside>
  )
}
