'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen } from 'lucide-react'

import { libraryApi } from '@/lib/api/library.api'
import { cn } from '@/lib/utils/cn'

/**
 * Teinte dérivée du titre — stable, et surtout DISTINCTE d'un livre à l'autre.
 *
 * Même raisonnement que les initiales d'un enfant sans photo : un catalogue
 * sans couvertures ne doit pas être une colonne de rectangles identiques, ce
 * qui est précisément la gêne qu'une couverture vient lever.
 */
const TINTS = [
  'bg-primary/15 text-primary',
  'bg-secondary/15 text-secondary',
  'bg-sky-500/15 text-sky-700',
  'bg-rose-500/15 text-rose-700',
  'bg-emerald-500/15 text-emerald-700',
  'bg-violet-500/15 text-violet-700',
] as const

function tintFor(seed: string): string {
  let n = 0
  for (const ch of seed) n = (n * 31 + ch.charCodeAt(0)) % 997
  return TINTS[n % TINTS.length] ?? TINTS[0]
}

/** Proportions d'un livre (~2:3), jamais un carré : une couverture rognée en
 *  carré perd son titre, qui est en haut. */
const SIZES = {
  sm: 'h-14 w-10',
  md: 'h-24 w-[4rem]',
  lg: 'h-36 w-24',
} as const

const ICONS = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-8',
} as const

/** Clé de cache de la VIGNETTE — partagée par tous les écrans, et invalidée
 *  après un remplacement (sans quoi l'ancienne image resterait affichée). */
export const coverThumbKey = (bookId: string) => ['library', 'cover-thumb', bookId]

/**
 * Couverture d'un livre, ou un repli teinté quand il n'y en a pas.
 *
 * ⚠️ La couverture passe par un endpoint AUTHENTIFIÉ : impossible de la poser
 * dans un `src` — il faut la télécharger avec le jeton, puis l'afficher en
 * `blob:`.
 *
 * ⚠️ On ne demande RIEN quand `hasCover` est faux. Sans ce drapeau, chaque
 * case d'un catalogue de cinquante livres lancerait une requête vouée à
 * une 404.
 *
 * La VIGNETTE par défaut : une case fait quelques dizaines de pixels et
 * l'original est une photo de couverture (cf. `app/core/thumbnails.py`).
 * `full` sert les rares endroits qui montrent l'image en grand.
 */
export function BookCover({
  bookId, title, hasCover, size = 'md', full = false, previewUrl, className,
}: {
  bookId: string
  title: string
  hasCover: boolean
  size?: keyof typeof SIZES
  full?: boolean
  /** Aperçu LOCAL d'un fichier choisi mais pas encore envoyé — prime sur tout
   *  le reste : c'est ce que l'utilisateur vient de sélectionner. */
  previewUrl?: string | null
  className?: string
}) {
  const { data: blob } = useQuery({
    queryKey: full ? ['library', 'cover-full', bookId] : coverThumbKey(bookId),
    queryFn: () => libraryApi.downloadCover(bookId, !full).then((r) => r.data),
    enabled: hasCover && !previewUrl,
    staleTime: Infinity,
    retry: 1,
  })

  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) return
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])

  const base = cn(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg',
    'ring-1 ring-border/60',
    SIZES[size], className,
  )

  const shown = previewUrl ?? (hasCover ? url : null)
  if (shown) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={shown} alt="" aria-hidden="true" className={cn(base, 'object-cover')} />
  }

  return (
    <span className={cn(base, tintFor(title))} aria-hidden="true">
      <BookOpen className={ICONS[size]} />
    </span>
  )
}
