/**
 * Règles de pré-sélection des fichiers, côté navigateur.
 *
 * ⚠️ **On ne refuse que ce dont on est SÛR.** Les pré-filtres du projet
 * testaient `file.type` — le MIME que le navigateur a bien voulu deviner — et
 * rejetaient donc, AVANT tout envoi, une photo parfaitement valide dont le type
 * n'était pas reconnu : un `.heic` d'iPhone, un fichier repris d'un
 * gestionnaire de fichiers, un document re-partagé depuis une messagerie. La
 * même photo passait depuis un autre appareil.
 *
 * Le serveur lit désormais les octets (`app/core/media.py`) : lui seul sait. En
 * cas de doute on laisse donc partir — un aller-retour vaut mieux qu'un refus
 * injustifié sur un fichier que le serveur aurait accepté.
 */

/** Extensions à lister en plus des types MIME dans `accept`.
 *
 * Sans elles, le sélecteur de fichiers GRISE des photos valides : sur plusieurs
 * plateformes un `.heic` n'a pas de type MIME connu du navigateur, donc
 * `image/*` ne le désigne pas. */
export const IMAGE_EXTENSIONS = '.heic,.heif,.avif'
export const VIDEO_EXTENSIONS = '.mov,.3gp,.mkv'

/** `accept` d'un dossier administratif : images + PDF, jamais de vidéo. */
export const ACCEPT_DOCUMENT = `image/*,application/pdf,${IMAGE_EXTENSIONS}`

/**
 * Vrai seulement si le fichier est EXPLICITEMENT du mauvais type.
 *
 * Un type vide n'est pas une réponse : c'est une absence de réponse, et elle
 * ne doit pas valoir refus.
 */
export function isObviouslyRejectedDocument(file: File): boolean {
  if (file.type === 'image/svg+xml') return true
  if (!file.type) return false
  return !(file.type.startsWith('image/') || file.type === 'application/pdf')
}

/** Un PDF n'est pas recompressé côté serveur : inutile de le téléverser pour
 *  se faire refuser. Une IMAGE, elle, sera allégée — on ne l'arrête jamais. */
export function isPdfOverLimit(file: File, maxMb: number): boolean {
  return file.type === 'application/pdf' && file.size > maxMb * 1024 * 1024
}
