'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { childrenApi } from '@/lib/api/children.api'
import { cn } from '@/lib/utils/cn'

/** Initiales de repli — un rond vide n'aide personne à reconnaître un enfant. */
function initials(firstNames: string, lastName: string): string {
  const a = firstNames.trim()[0] ?? ''
  const b = lastName.trim()[0] ?? ''
  return (a + b).toUpperCase() || '?'
}

/**
 * Teinte dérivée du nom — stable, et surtout DISTINCTE d'un enfant à l'autre.
 *
 * Sans elle, une liste sans photos n'est qu'une colonne de ronds identiques,
 * ce qui est précisément la gêne qu'on cherche à lever.
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

const SIZES = {
  sm: 'size-8 text-[11px]',
  md: 'size-10 text-xs',
  lg: 'size-16 text-base',
  xl: 'size-28 text-2xl',
} as const

/**
 * Photo de profil d'un enfant, ou ses initiales.
 *
 * ⚠️ La photo passe par un endpoint AUTHENTIFIÉ : impossible de la poser dans
 * un `src` — il faut la télécharger avec le jeton, puis l'afficher en `blob:`.
 *
 * ⚠️ On ne demande RIEN quand `hasPhoto` est faux. Sans ce drapeau, chaque case
 * d'une liste de trente enfants lancerait une requête vouée à une 404.
 *
 * La VIGNETTE, toujours : une case fait au plus cent pixels et l'original est
 * une photo de téléphone (cf. `app/core/thumbnails.py`).
 */
export function ChildAvatar({
  childId, firstNames, lastName, hasPhoto, size = 'md', className,
}: {
  childId: string
  firstNames: string
  lastName: string
  hasPhoto: boolean
  size?: keyof typeof SIZES
  className?: string
}) {
  const { data: blob } = useQuery({
    queryKey: ['children', 'photo-thumb', childId],
    queryFn: () => childrenApi.downloadPhoto(childId, true).then((r) => r.data),
    enabled: hasPhoto,
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
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold',
    SIZES[size], className,
  )

  if (hasPhoto && url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" aria-hidden="true" className={cn(base, 'object-cover')} />
  }

  return (
    <span className={cn(base, tintFor(`${firstNames}${lastName}`))} aria-hidden="true">
      {initials(firstNames, lastName)}
    </span>
  )
}
