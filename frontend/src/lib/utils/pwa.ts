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
