'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Menu, X, MessageCircle, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BRAND } from '@/lib/marketing/data'

const NAV_ITEMS = [
  { name: 'Accueil', href: '/' },
  { name: 'À Propos', href: '/a-propos' },
  { name: 'Nos Sections', href: '/nos-sections' },
  { name: 'Galerie', href: '/galerie' },
  { name: 'Actualités', href: '/actualites' },
  { name: 'Contact', href: '/contact' },
]

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const solid = scrolled || menuOpen

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        solid ? 'bg-background/95 shadow-sm backdrop-blur-md' : 'bg-transparent'
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:h-[72px] lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label={BRAND.name}>
          <Image src="/images/marketing/logo.png" alt={BRAND.name} width={148} height={90} className="h-11 w-auto sm:h-12" priority />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {NAV_ITEMS.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative text-sm font-medium transition-colors',
                  solid ? 'text-foreground/80 hover:text-secondary' : 'text-green hover:text-secondary',
                  active && (solid ? 'text-primary' : 'text-white')
                )}
              >
                {item.name}
                {active && (
                  <span
                    className={cn(
                      'absolute -bottom-1.5 left-0 h-0.5 w-full rounded-full',
                      solid ? 'bg-primary' : 'bg-white'
                    )}
                  />
                )}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href={BRAND.whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Discuter sur WhatsApp"
            className={cn(
              'hidden size-10 shrink-0 items-center justify-center rounded-full transition-colors sm:inline-flex',
              solid ? 'bg-[#25D366]/10 text-[#1fb959] hover:bg-[#25D366]/20' : 'bg-white/15 text-white hover:bg-white/25'
            )}
          >
            <MessageCircle className="size-5" />
          </a>
          <Link
            href="/auth/login"
            className={cn(
              'hidden items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors sm:inline-flex',
              solid
                ? 'border-primary text-primary hover:bg-primary hover:text-primary-foreground'
                : 'border-white/60 text-white hover:bg-white hover:text-primary'
            )}
          >
            <User className="size-4" />
            Espace Parent
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={menuOpen}
            className={cn(
              'inline-flex size-10 items-center justify-center rounded-full transition-colors lg:hidden',
              solid ? 'text-foreground hover:bg-muted' : 'text-white hover:bg-white/15'
            )}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-border bg-background px-4 pb-6 pt-2 shadow-lg lg:hidden">
          <nav className="flex flex-col divide-y divide-border">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="py-3 text-base font-medium text-foreground/90 hover:text-primary"
              >
                {item.name}
              </Link>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-3">
            <a
              href={BRAND.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#25D366] text-sm font-medium text-white"
            >
              <MessageCircle className="size-4" />
              Discuter sur WhatsApp
            </a>
            <Link
              href="/auth/login"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border-2 border-primary text-sm font-medium text-primary"
            >
              <User className="size-4" />
              Espace Parent
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
