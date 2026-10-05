'use client'

import { useTranslations } from 'next-intl'

import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils/cn'
import { useRouter } from '@/i18n/navigation'

/**
 * Pastille Actif/Inactif (M8).
 *
 * ⚠️ Les libellés étaient des VALEURS PAR DÉFAUT de paramètres
 * (`activeLabel = 'Actif'`), et douze des treize appels ne passaient rien :
 * tout l'espace admin affichait « Actif » au milieu de l'interface anglaise.
 * Aucune des quatre gardes ne pouvait le voir — ce n'est ni du texte JSX, ni un
 * message Zod, ni une clé manquante. Le composant traduit donc lui-même ; les
 * props ne restent que pour un libellé plus précis que « actif » (cf. la
 * bibliothèque, qui dit « disponible »).
 */
export function StatusPill({
  active, activeLabel, inactiveLabel, shrink = false,
}: {
  active: boolean
  activeLabel?: string
  inactiveLabel?: string
  /** Version carte : anti-écrasement flex. */
  shrink?: boolean
}) {
  const tCommon = useTranslations('common')
  return (
    <span
      className={cn(
        'rounded-full px-3 py-1 text-xs font-semibold',
        shrink ? 'shrink-0' : 'inline-block',
        active ? 'bg-pale-green text-white' : 'bg-muted text-muted-foreground',
      )}
    >
      {active ? (activeLabel ?? tCommon('states.active')) : (inactiveLabel ?? tCommon('states.inactive'))}
    </span>
  )
}

/** Grille de cartes `md:2 lg:3` (M12). */
export function CardsGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 md:grid-cols-2 lg:grid-cols-3', className)}>{children}</div>
}

/** Élément avec apparition en cascade (M12). */
export function StaggerItem({
  index, children, step = 0.05, cap = 8,
}: {
  index: number
  children: ReactNode
  step?: number
  cap?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, cap) * step }}
    >
      {children}
    </motion.div>
  )
}

/** Carte cliquable vers une page détail (M12). */
export function ClickableCard({
  href, label, inactive = false, children, className,
}: {
  href: string
  label: string
  inactive?: boolean
  children: ReactNode
  className?: string
}) {
  const router = useRouter()
  return (
    <Card
      className={cn(
        'cursor-pointer rounded-2xl shadow-soft transition hover:-translate-y-0.5',
        inactive && 'opacity-75',
        className,
      )}
      onClick={() => router.push(href)}
      onKeyDown={(e) => { if (e.key === 'Enter') router.push(href) }}
      tabIndex={0}
      role="link"
      aria-label={label}
    >
      {children}
    </Card>
  )
}

/** Skeletons de cartes (M9-b). */
export function CardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <CardsGrid>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-2 p-5">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-40" />
          </CardContent>
        </Card>
      ))}
    </CardsGrid>
  )
}

/** État vide version cartes (M10-b). */
export function CardsEmptyState({
  icon: Icon, title, description, action, heightClass = 'h-56', iconClassName,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  heightClass?: string
  iconClassName?: string
}) {
  return (
    <Card>
      <CardContent className={cn('flex flex-col items-center justify-center gap-3 text-center text-muted-foreground', heightClass)}>
        <div className={cn('flex size-12 items-center justify-center rounded-full bg-muted', iconClassName)}>
          <Icon className="size-5" />
        </div>
        <p className="font-medium text-foreground">{title}</p>
        {description && <p className="max-w-sm text-sm">{description}</p>}
        {action}
      </CardContent>
    </Card>
  )
}

/** Squelette des pages détail (M9-c). */
export function DetailSkeleton({ className = 'max-w-3xl space-y-4' }: { className?: string }) {
  return (
    <div className={className}>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
