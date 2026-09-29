'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { useTransition } from 'react'

import { usePathname, useRouter } from '@/i18n/navigation'
import { LOCALES, type AppLocale } from '@/i18n/routing'
import { authApi } from '@/lib/api/auth.api'
import { useAuthStore } from '@/lib/stores/auth.store'
import { cn } from '@/lib/utils/cn'

/**
 * Bascule FR/EN — présente dans l'en-tête du site vitrine comme dans celui de
 * tous les espaces connectés.
 *
 * Deux écritures ont lieu, et elles ne servent pas la même chose :
 *  - le cookie posé par `next-intl` pilote l'affichage, y compris pour un
 *    visiteur anonyme ;
 *  - `PATCH /auth/me/locale` enregistre le choix sur le compte, seule source
 *    de vérité pour ce qui part hors navigateur (emails, PDF, push) — le
 *    backend n'a aucun accès au cookie au moment d'un envoi différé.
 *
 * L'appel réseau est volontairement « best-effort » : un échec ne doit pas
 * empêcher la bascule visuelle, déjà appliquée par la navigation.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations('common.locale')
  const active = useLocale() as AppLocale
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams()
  const [isPending, startTransition] = useTransition()

  const isAuthenticated = useAuthStore((s) => !!s.accessToken)
  const setUser = useAuthStore((s) => s.setUser)

  function switchTo(next: AppLocale) {
    if (next === active || isPending) return

    if (isAuthenticated) {
      authApi
        .setLocale(next)
        .then(({ data }) => setUser(data))
        .catch(() => {
          // Silencieux par choix : la langue a déjà changé à l'écran, et un
          // toast d'erreur ici n'apprendrait rien d'actionnable à l'utilisateur.
        })
    }

    // `pathname` est le chemin SANS préfixe de langue ; `params` réinjecte les
    // segments dynamiques ([id], [locale]) pour que la bascule reste sur la
    // même page plutôt que de renvoyer à l'accueil.
    startTransition(() => {
      router.replace(
        // @ts-expect-error — `pathname` est ici une chaîne dynamique issue du
        // routeur, que la signature typée de next-intl ne peut pas relier à
        // une route connue à la compilation.
        { pathname, params },
        { locale: next },
      )
    })
  }

  return (
    <div
      className={cn(
        'flex items-center rounded-md border border-border bg-card p-0.5',
        className,
      )}
      role="group"
      aria-label={t('label')}
    >
      {LOCALES.map((locale) => {
        const isActive = locale === active
        return (
          <button
            key={locale}
            type="button"
            onClick={() => switchTo(locale)}
            disabled={isPending}
            aria-current={isActive ? 'true' : undefined}
            aria-label={t('switchTo', { language: t(locale) })}
            title={t('switchTo', { language: t(locale) })}
            className={cn(
              'rounded px-2 py-1 text-xs font-medium uppercase transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
              isPending && 'cursor-not-allowed opacity-60',
            )}
          >
            {locale}
          </button>
        )
      })}
    </div>
  )
}
