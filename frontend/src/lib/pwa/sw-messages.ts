/**
 * Messages envoyés au service worker.
 *
 * ⚠️ C'est le WORKER qui agit, pas la page. Les règles « que garder en cache »
 * et « sous quelle clé » dépendent de la liste précachée et des stratégies de
 * cache, qui vivent dans `public/sw.js` : une seconde copie ici finirait par en
 * diverger, et le jour où elle divergerait, on effacerait soit trop (la page
 * hors-ligne, qui n'est reprécachée qu'au prochain changement de
 * `CACHE_VERSION`), soit pas assez — sans que rien ne le signale.
 *
 * Best-effort, jamais bloquant : un navigateur sans service worker (HTTP hors
 * localhost) doit pouvoir se déconnecter et changer de langue normalement.
 */
function post(message: { type: string; locale?: string }): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  const controller = navigator.serviceWorker.controller
  if (controller) {
    controller.postMessage(message)
    return
  }

  // Page pas encore pilotée (tout premier chargement, juste avant le claim).
  // ⚠️ Ne JAMAIS attendre `ready` dans un flux utilisateur : sans worker
  // enregistré, cette promesse ne se résout jamais.
  void navigator.serviceWorker.ready
    .then((registration) => registration.active?.postMessage(message))
    .catch(() => {})
}

/** Fin de session : le worker retire du cache les pages visitées. */
export function notifySessionEnded(): void {
  post({ type: 'session-ended' })
}

/**
 * Langue affichée : le worker réaligne l'accueil précaché.
 *
 * Hors ligne, un francophone sur un appareil anglophone voyait l'accueil en
 * anglais : `/` est redirigé vers `/en` par la détection de langue, et c'était
 * l'anglais qui finissait gravé sous la clé française. On ne peut pas exempter
 * l'accueil de la détection — ce serait la couper. Mais une fois le choix fait,
 * le cookie de langue est posé et `/` sert enfin le français : il suffit de le
 * redemander. C'est ce que le worker fait ici, et uniquement si nécessaire.
 *
 * Émis à chaque chargement de page, pas seulement à la bascule : le worker peut
 * s'être installé AVANT que l'utilisateur n'ait choisi sa langue, et rien ne
 * serait alors jamais venu rattraper son accueil.
 */
export function notifyLocaleChanged(locale: string): void {
  post({ type: 'locale-changed', locale })
}
