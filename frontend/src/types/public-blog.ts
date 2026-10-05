/*
 * Types des réponses PUBLIQUES du module blog (site vitrine) — aucun token.
 * Caméléons des schémas backend `blog/schemas.py` (public_router.py), en
 * camelCase côté frontend.
 */

import type { GalleryPhotoCategory } from './blog'

export interface PublicBlogTag {
  id: string
  name: string
}

export interface PublicBlogPostItem {
  id: string
  title: string
  tag: PublicBlogTag | null
  coverUrl: string | null
  publishedAt: string | null
  /**
   * Langue dans laquelle l'API a RÉELLEMENT servi le texte — pas celle
   * demandée. Vaut « fr » quand la traduction anglaise manque (jamais
   * générée, ou en échec), ce qui permet de signaler le repli au visiteur
   * plutôt que de lui laisser croire à un texte anglais.
   */
  locale: string
}

export interface PublicBlogPost extends PublicBlogPostItem {
  content: string
}

/** Élément de liste enrichi côté serveur avec un excerpt affichable. */
export interface PublicBlogPostPreview extends PublicBlogPostItem {
  excerpt: string
}

/** Photo de la galerie du site vitrine — consultable sans authentification. */
export interface PublicGalleryPhoto {
  id: string
  category: GalleryPhotoCategory | null
  content_type: string
  size_bytes: number
  created_at: string
  url: string
}