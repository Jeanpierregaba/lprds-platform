'use client'

import { useLocale } from 'next-intl'
import { useParams } from 'next/navigation'
import { useTransition } from 'react'

import { usePathname, useRouter } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'
import { authApi } from '@/lib/api/auth.api'
import { useAuthStore } from '@/lib/stores/auth.store'

/**
 * Bascule de langue — la mécanique, sans l'apparence.
 *
 * Deux surfaces la déclenchent (le bouton de l'en-tête et la carte des
 * paramètres) et elle ne doit exister qu'une fois : l'ordre des écritures est
 * subtil, et s'en écarter d'un côté donnerait deux comportements divergents
 * pour un même geste.
 *
 * Deux écritures ont lieu, et elles ne servent pas la même chose :
 *  - le cookie posé par `next-intl` pendant la navigation pilote l'AFFICHAGE,
 *    y compris pour un visiteur anonyme ;
 *  - `PATCH /auth/me/locale` enregistre le choix sur le COMPTE, seule source de
 *    vérité pour ce qui part hors navigateur (emails, bulletins, notifications
 *    push) — le backend n'a aucun accès au cookie au moment d'un envoi différé.
 *
 * ⚠️ L'appel réseau est « best-effort », et c'est ce qui explique l'ordre de
 * priorité documenté dans `detect.ts` : le cookie passe AVANT le compte. On
 * navigue sans attendre la réponse ; faire primer le compte renverrait
 * l'utilisateur d'où il vient le temps de l'aller-retour, et définitivement si
 * l'appel échoue.
 */
export function useLocaleSwitch() {
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

  return { active, switchTo, isPending }
}
