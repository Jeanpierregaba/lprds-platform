import { authApi } from '@/lib/api/auth.api'
import { useAuthStore } from '@/lib/stores/auth.store'
import { clientLocale } from '@/i18n/client-locale'
import { DEFAULT_LOCALE } from '@/i18n/routing'

/**
 * Le geste de déconnexion, en un seul endroit.
 *
 * Il vivait en DEUX copies identiques (barre latérale et navigation mobile),
 * deux occasions de n'en durcir qu'une — même raisonnement que
 * `useLocaleSwitch()` pour la bascule de langue.
 *
 * ⚠️ **Rechargement complet, pas une navigation client.** `router.push()`
 * gardait en mémoire le cache de React Query (fiches enfants, messages, listes
 * de la session qui vient de se terminer) et le cache de routeur de Next, qui
 * peut réafficher une page du tableau de bord sur un retour arrière. Sur un
 * appareil partagé, c'est exactement ce qu'on ne veut pas. Un chargement neuf
 * les efface tous les deux d'un coup, sans course entre le vidage du cache et
 * les composants encore montés — qui, privés de leurs données ET de leur
 * jeton, déclencheraient une volée de 401.
 *
 * Les caches du service worker, eux, survivent au rechargement : c'est
 * `clearSession()` qui prévient le worker (cf. `notifySessionEnded`).
 *
 * La destination suit la langue courante : le français n'a pas de préfixe, un
 * utilisateur anglophone revient sur `/en` — sinon le middleware le
 * redirigerait, un aller-retour pour rien.
 */
export async function logout(): Promise<void> {
  const { refreshToken, clearSession } = useAuthStore.getState()

  try {
    if (refreshToken) await authApi.logout(refreshToken)
  } catch {
    // Best-effort : la session locale est nettoyée même si l'appel échoue.
  } finally {
    clearSession()
    const locale = clientLocale()
    window.location.assign(locale === DEFAULT_LOCALE ? '/' : `/${locale}`)
  }
}
