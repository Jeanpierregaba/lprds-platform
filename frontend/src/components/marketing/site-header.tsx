'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Menu, X, MessageCircle, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BRAND, MARKETING_NAV } from '@/lib/marketing/data'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { Link, usePathname } from '@/i18n/navigation'

export function SiteHeader() {
  const tNav = useTranslations('marketing.nav')
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  return (
    // Header flottant façon pilule (inspiration maquette) : crème (ancien fond
    // du hero), logo à gauche, nav au centre, actions à droite. Toujours opaque
    // — plus d'état transparent/solide au scroll.
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between rounded-full bg-cream px-4 shadow-lg ring-1 ring-black/5 sm:px-6 lg:h-[72px] lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label={BRAND.name}>
          <Image src="/images/marketing/logo.png" alt={BRAND.name} width={148} height={90} className="h-11 w-auto sm:h-12" priority />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {MARKETING_NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative text-sm font-medium transition-colors',
                  'text-secondary hover:text-primary',
                  active && 'text-primary'
                )}
              >
                {tNav(item.key)}
                {active && (
                  <span
                    className={cn(
                      'absolute -bottom-1.5 left-0 h-0.5 w-full rounded-full',
                      'bg-primary'
                    )}
                  />
                )}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <LocaleSwitcher />
          <a
            href={BRAND.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={tNav('whatsapp')}
            className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-tertiary text-tertiary-foreground transition-all hover:bg-tertiary/90 sm:inline-flex"
          >
            <MessageCircle className="size-5" />
          </a>
          <Link
            href="/auth/login"
            className={cn(
              'hidden items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all sm:inline-flex',
              'bg-primary text-primary-foreground shadow-[0_4px_0_var(--color-primary-layer)]',
              'hover:translate-y-1 hover:shadow-none'
            )}
          >
            <User className="size-4" />
            {tNav('parentArea')}
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? tNav('closeMenu') : tNav('openMenu')}
            aria-expanded={menuOpen}
            className="inline-flex size-10 items-center justify-center rounded-full text-primary transition-colors hover:bg-black/5 lg:hidden"
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="mx-auto mt-2 max-h-[calc(100dvh-7rem)] max-w-7xl overflow-y-auto rounded-3xl bg-cream px-4 pb-6 pt-2 shadow-lg ring-1 ring-black/5 lg:hidden">
          <nav className="flex flex-col divide-y divide-border">
            {MARKETING_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="py-3 text-base font-medium text-foreground/90 hover:text-primary"
              >
                {tNav(item.key)}
              </Link>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-3">
            <a
              href={BRAND.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#25D366] text-sm font-medium text-white"
            >
              <MessageCircle className="size-4" />
              {tNav('whatsapp')}
            </a>
            <Link
              href="/auth/login"
              onClick={() => setMenuOpen(false)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-foreground shadow-[0_4px_0_var(--color-primary-layer)] transition-all hover:translate-y-1 hover:shadow-none"
            >
              <User className="size-4" />
              {tNav('parentArea')}
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
