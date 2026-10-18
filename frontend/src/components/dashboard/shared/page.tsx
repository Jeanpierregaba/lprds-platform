'use client'

import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'
import { Link } from '@/i18n/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { ROLE_HOME } from '@/types/auth'
import type { PermissionCode } from '@/types/rbac'

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
  const t = useTranslations('common')
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Link href={backHref} className="text-sm text-primary hover:underline">{t('actions.backToList')}</Link>
    </div>
  )
}

/**
 * Garde d'ENTRÉE d'une page de module, pour le staff délégué.
 *
 * ⚠️ Six pages du tableau de bord n'en avaient aucune — rôles, actualités,
 * galerie, organisation, bibliothèque, menus, rapports — alors que les pages
 * `new` en portaient une depuis toujours. Le proxy laisse délibérément tout
 * compte `staff` entrer sous `/dashboard/admin/*` (il y réutilise les mêmes
 * écrans), donc un membre sans le droit voyait la page s'afficher et ses
 * requêtes répondre 403 : l'écran annonçait « aucun rôle », « aucun article »
 * — une absence de données, là où il fallait lire un refus. Vu de
 * l'établissement, ça ressemble à une panne de son compte.
 *
 * Elle NOMME le droit manquant, et c'est tout l'intérêt : « droits
 * insuffisants » n'apprend rien à qui doit le réparer, alors que le libellé
 * exact est ce que l'admin va chercher dans l'écran Rôles.
 *
 * Sémantique OU, comme `require_any_permission` côté serveur : la barre
 * latérale montre un module dès UNE permission du module, la garde ne peut pas
 * être plus étroite sans recréer « page visible, données 403 ».
 */
export function ModuleGuard({
  anyOf = [],
  adminOnly = false,
  children,
}: {
  anyOf?: PermissionCode[]
  /** Aucune permission ne délègue cette page (gestion des rôles, réglages). */
  adminOnly?: boolean
  children: ReactNode
}) {
  const t = useTranslations('common')
  const tErrors = useTranslations('errors')
  const tRbac = useTranslations('rbac')
  const user = useUser()
  const { permissions, isLoading } = useMyPermissions()

  // Les permissions arrivent en ASYNCHRONE : refuser pendant le chargement
  // ferait clignoter un refus sur l'écran de quelqu'un qui a le droit.
  if (isLoading) {
    return <Skeleton className="h-32 w-full rounded-xl" />
  }

  const allowed =
    user?.role === 'admin' ||
    (!adminOnly && anyOf.some((code) => permissions.has(code)))
  if (allowed) return <>{children}</>

  return (
    <div className="mx-auto w-full max-w-xl space-y-3 py-8">
      <p className="font-display text-lg">{tErrors('insufficientRights')}</p>
      {adminOnly ? (
        <p className="text-sm text-muted-foreground">{t('rights.adminOnly')}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t('rights.explain')}</p>
          <ul className="list-inside list-disc space-y-1 text-sm">
            {anyOf.map((code) => (
              <li key={code}>{tRbac(`permissions.${code}`)}</li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">{t('rights.ask')}</p>
        </>
      )}
      <Link
        href={user?.role ? ROLE_HOME[user.role] : '/dashboard/staff'}
        className="inline-block text-sm text-primary hover:underline"
      >
        {t('rights.home')}
      </Link>
    </div>
  )
}
