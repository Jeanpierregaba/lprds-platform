/** Le blob reste joignable une minute après le clic : le temps que le
 *  gestionnaire de téléchargements du système ait fini d'aller le chercher. */
const REVOKE_DELAY_MS = 60_000

/**
 * Enregistre un blob sous un nom de fichier.
 *
 * ⚠️ **Deux détails décident si le téléchargement a lieu**, et leur absence
 * produit un échec qu'AUCUN `try/catch` ne peut rattraper : `a.click()` rend
 * la main normalement, et c'est le système, plus tard, qui renonce.
 *
 * 1. **L'ancre doit être DANS le document.** Un élément détaché ne déclenche
 *    pas de téléchargement sur tous les navigateurs — Firefox l'exige depuis
 *    toujours.
 * 2. **L'URL ne doit PAS être révoquée tout de suite.** `URL.revokeObjectURL`
 *    appelé dans la foulée du clic est une course : le navigateur n'a souvent
 *    pas encore commencé à lire le blob. Sur Android, l'URL morte retombe
 *    alors sur le gestionnaire de téléchargements du système, qui ne sait
 *    traiter que `http`/`https` et refuse en affichant « seules les URL de
 *    type http ou https permettent le téléchargement ».
 *
 * C'est exactement ce qu'un parent a signalé sur un PDF de diffusion — et le
 * défaut favorise les GROS fichiers, qui mettent plus longtemps à être lus :
 * les vignettes passaient, le document non.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}

/**
 * Nom de fichier annoncé par le serveur (`Content-Disposition`), sinon le
 * repli local. Trois écrans en avaient chacun leur copie — dont deux qui
 * révoquaient l'URL trop tôt (cf. ci-dessus), et une seule qui avait appris
 * la leçon dans son coin : c'est exactement ainsi qu'un correctif reste
 * cantonné à l'endroit où le défaut a été vu.
 */
export function filenameFromDisposition(
  disposition: string | undefined,
  fallback: string,
): string {
  const match = /filename="([^"]+)"/.exec(disposition ?? '')
  return match?.[1] ?? fallback
}
