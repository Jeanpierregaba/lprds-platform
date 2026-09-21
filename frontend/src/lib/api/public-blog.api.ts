/*
 * Consultation publique du blog (site vitrine) — SANS authentification.
 *
 * Toujours utilisé côté serveur (server components), directement vers le
 * backend via NEXT_PUBLIC_API_URL. Les cover_url renvoyées par l'API sont
 * des chemins RELATIFS (/api/v1/public/blog/{code}/articles/{id}/cover) : ils
 * deviennent des URLs same-origin sur le frontend grâce au rewrite de
 * next.config.ts, et peuvent être utilisés tels quels dans des balises img.
 */

import type { PublicBlogPostItem, PublicBlogTag, PublicGalleryPhoto } from '@/types/public-blog'
import type { GalleryPhotoCategory } from '@/types/blog'

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/+$/, '')
const ESTABLISHMENT_CODE = process.env.NEXT_PUBLIC_ESTABLISHMENT_CODE ?? 'LPRDS'

type RawListItem = {
  id: string
  title: string
  tag: PublicBlogTag | null
  cover_url: string | null
  published_at: string | null
}

type RawDetail = RawListItem & {
  content: string
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch (error) {
    console.warn(`[public-blog] échec de récupération — ${path}`, error)
    return null
  }
}

function toPostItem(raw: RawListItem): PublicBlogPostItem {
  return {
    id: raw.id,
    title: raw.title,
    tag: raw.tag,
    coverUrl: raw.cover_url,
    publishedAt: raw.published_at,
  }
}

/** Extrait un aperçu affichable du contenu d'un article (l'API liste n'a pas d'excerpt). */
function buildExcerpt(content: string, max = 170): string {
  const plain = content.replace(/\s+/g, ' ').trim()
  if (plain.length <= max) return plain
  const cut = plain.slice(0, max)
  const boundary = cut.lastIndexOf(' ')
  return `${cut.slice(0, boundary > 0 ? boundary : max).trim()}…`
}

/** Liste des articles publiés (avec excerpt calculée à partir du contenu). */
export async function fetchPublicBlogPosts(tagId?: string) {
  const query = tagId ? `?tag_id=${tagId}` : ''
  const data = await getJson<{ total: number; items: RawListItem[] }>(
    `/api/v1/public/blog/${ESTABLISHMENT_CODE}/articles${query}`
  )
  if (!data) return []

  const items = data.items.map(toPostItem)
  const details = await Promise.all(items.map((item) => fetchPublicBlogPost(item.id)))

  return items.map((item, index) => ({
    ...item,
    excerpt: buildExcerpt(details[index]?.content ?? ''),
  }))
}

/** Détail d'un article publié — null si introuvable (status non-2xx). */
export async function fetchPublicBlogPost(id: string) {
  const data = await getJson<RawDetail>(
    `/api/v1/public/blog/${ESTABLISHMENT_CODE}/articles/${id}`
  )
  if (!data) return null
  return { ...toPostItem(data), content: data.content }
}

/** Étiquettes utilisées pour le filtre de la page actualités. */
export async function fetchPublicBlogTags(): Promise<PublicBlogTag[]> {
  const data = await getJson<{ items: PublicBlogTag[] }>(
    `/api/v1/public/blog/${ESTABLISHMENT_CODE}/tags`
  )
  return data?.items ?? []
}

/** Photos de la galerie du site vitrine (toutes catégories ou une seule). */
export async function fetchPublicGallery(categoryId?: string): Promise<PublicGalleryPhoto[]> {
  const query = categoryId ? `?category_id=${categoryId}` : ''
  const data = await getJson<{ total: number; items: PublicGalleryPhoto[] }>(
    `/api/v1/public/blog/${ESTABLISHMENT_CODE}/gallery${query}`
  )
  return data?.items ?? []
}

/** Catégories de la galerie — pastilles de filtre (jamais d'identifiant exposé). */
export async function fetchPublicGalleryCategories(): Promise<GalleryPhotoCategory[]> {
  const data = await getJson<{ items: GalleryPhotoCategory[] }>(
    `/api/v1/public/blog/${ESTABLISHMENT_CODE}/gallery/categories`
  )
  return data?.items ?? []
}

/** Trie les articles du plus récent au plus ancien (null = mois récent en dernier). */
export function sortByPublished<T extends { publishedAt: string | null }>(posts: T[]): T[] {
  return [...posts].sort((a, b) => {
    const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
    const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
    return timeB - timeA
  })
}