'use client'

import { useTranslations } from 'next-intl'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { ThemeToggle } from './theme-toggle'
import { MobileNav } from './mobile-nav'
import { useUser } from '@/lib/stores/auth.store'
import { displayInitials, displayName } from '@/lib/utils/display-name'

export function Header() {
  const user = useUser()
  const tRoles = useTranslations('enums.roles')

  if (!user) return null

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-accent px-2 sm:px-4">
      <MobileNav />
      <div className="ml-auto flex items-center gap-2">
        <LocaleSwitcher />
        <ThemeToggle />
        <div className="flex items-center gap-2 rounded-md px-2 py-2 text-sm">
          <Avatar>
            <AvatarFallback>{displayInitials(user)}</AvatarFallback>
          </Avatar>
          <span className="hidden text-left sm:block">
            <span className="block font-medium leading-none">
              {displayName(user)}
            </span>
            <span className="block text-xs text-muted-foreground">
              {tRoles(user.role)}
            </span>
          </span>
        </div>
      </div>
    </header>
  )
}
