'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type NavItem } from './nav-items'
import { cn } from '@/lib/utils'

export function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname()

  const activeHref = (() => {
    const matches = items.filter(
      (i) => pathname === i.href || pathname.startsWith(`${i.href}/`),
    )
    return matches.reduce<string | null>(
      (longest, i) => (longest === null || i.href.length > longest.length ? i.href : longest),
      null,
    )
  })()

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-3">
      {items.map((item) => {
        const isActive = item.href === activeHref
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              isActive
                ? 'bg-primary text-primary-foreground shadow-[0_4px_0_var(--color-primary-layer)] hover:translate-y-1 hover:shadow-none'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
