'use client'

import { useTranslations } from 'next-intl'

import Image from 'next/image'
import { LogOut, Menu } from 'lucide-react'
import { toast } from 'sonner'
import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useUser } from '@/lib/stores/auth.store'
import { logout } from '@/lib/auth/logout'
import { useMessagingUnread } from '@/lib/messaging/use-messaging-unread'
import { NavList } from './nav-list'
import { useNavItems } from './use-nav-items'

export function MobileNav() {
  const t = useTranslations('common')
  const tNav = useTranslations('nav')
  const user = useUser()
  const items = useNavItems()
  const unreadMessages = useMessagingUnread()
  const [open, setOpen] = useState(false)

  if (!user) return null

  const handleLogout = async () => {
    setOpen(false)
    await logout()
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={tNav('openNavigation')}
          />
        }
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 bg-accent p-0">
        <SheetHeader className="flex h-14 flex-row items-center border-b border-border px-4">
          <SheetTitle className="flex items-center">
            <Image
              src="/images/marketing/logo.png"
              alt="Les Petits Rayons de Soleil"
              width={148}
              height={90}
              className="h-9 w-auto"
            />
          </SheetTitle>
        </SheetHeader>
        <NavList
          items={items}
          onNavigate={() => setOpen(false)}
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
            {t('signOut')}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
