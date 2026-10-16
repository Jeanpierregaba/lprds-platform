import { downloadBlob } from './download'

/** true quand l'app tourne installée (PWA standalone), tous navigateurs. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    'standalone' in window.navigator ||
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

/**
 * Enregistre un média : en PWA (installée) via la feuille de partage native
 * — l'OS propose « Enregistrer l'image/la vidéo » vers la galerie photo —
 * sinon téléchargement classique vers le dossier Téléchargements (web).
 * Annulation du partage = silencieux ; autre échec = repli téléchargement.
 */
export async function shareOrDownload(
  blob: Blob,
  filename: string,
  contentType: string
): Promise<void> {
  const file = new File([blob], filename, { type: contentType || blob.type })
  if (
    isStandalone() &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (err) {
      if (isAbortError(err)) return
    }
  }
  downloadBlob(blob, filename)
}

/**
 * Le partage natif d'un FICHIER est-il praticable ici ?
 *
 * Deux conditions, et la seconde compte autant que la première : un appareil
 * TACTILE. Sur un poste de bureau, `navigator.canShare` existe aussi, mais un
 * bouton « Partager » y ferait doublon avec « Enregistrer », qui marche très
 * bien — alors que sur mobile c'est souvent le seul chemin qui aboutit.
 */
export function canShareFilesHere(contentType: string): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false
  const touch = isStandalone() || window.matchMedia('(pointer: coarse)').matches
  if (!touch) return false
  const probe = new File([new Uint8Array(1)], 'probe', { type: contentType || 'application/octet-stream' })
  try {
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

/**
 * Ouvre la feuille de partage du système sur ce fichier — « Enregistrer dans
 * Fichiers », « Envoyer par… ». Rend `false` si l'utilisateur a annulé ou si
 * le partage a échoué, à l'appelant de proposer autre chose.
 */
export async function shareFile(
  blob: Blob,
  filename: string,
  contentType: string,
): Promise<boolean> {
  const file = new File([blob], filename, { type: contentType || blob.type })
  try {
    await navigator.share({ files: [file] })
    return true
  } catch (err) {
    // Annulation : l'utilisateur a refermé la feuille, il n'y a rien à dire.
    if (isAbortError(err)) return true
    return false
  }
}
