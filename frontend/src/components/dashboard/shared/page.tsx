'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

/** Wrapper d'animation standard des pages (M1). */
export function PageMotion({ children, className = 'space-y-4' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/** En-tête `h1 + description + actions` (M2). Sans actions : simple bloc titre. */
export function PageHeader({
  title, description, actions,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  if (!actions) {
    return (
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  )
}

/** Lien retour sobre des pages détail / création (M13-A). */
export function BackLink({ href, label, bold = true }: { href: string; label: string; bold?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4 text-white" />
      <span className={cn('text-white', bold && 'font-semibold')}>{label}</span>
    </Link>
  )
}

/** Garde « Droits insuffisants » des pages `new` (M15). */
export function RightsGuard({ message, backHref }: { message: string; backHref: string }) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Link href={backHref} className="text-sm text-primary hover:underline">Retour à la liste</Link>
    </div>
  )
}
