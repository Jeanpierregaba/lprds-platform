'use client'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ThemeToggle } from './theme-toggle'
import { useUser } from '@/lib/stores/auth.store'
import { ROLE_LABELS } from '@/types/auth'

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
}

export function Header() {
  const user = useUser()

  if (!user) return null

  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-4">
      <div />
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <div className="flex items-center gap-2 rounded-md px-2 py-2 text-sm">
          <Avatar>
            <AvatarFallback>{initials(user.first_name, user.last_name)}</AvatarFallback>
          </Avatar>
          <span className="hidden text-left sm:block">
            <span className="block font-medium leading-none">
              {user.first_name} {user.last_name}
            </span>
            <span className="block text-xs text-muted-foreground">
              {ROLE_LABELS[user.role]}
            </span>
          </span>
        </div>
      </div>
    </header>
  )
}
