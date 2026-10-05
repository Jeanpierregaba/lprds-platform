'use client'

import { useEffect, useState } from 'react'
import { useQuery, type QueryKey } from '@tanstack/react-query'
import { FileVideo, ImageOff, Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

function isImage(contentType: string) {
  return contentType.startsWith('image/')
}

function isVideo(contentType: string) {
  return contentType.startsWith('video/')
}

/** Récupère un média authentifié (image/vidéo) via son endpoint de téléchargement et l'affiche en `blob:` URL. */
export function AuthMedia({
  queryKey, fetchBlob, contentType, alt, className, controls = false,
}: {
  queryKey: QueryKey
  fetchBlob: () => Promise<Blob>
  contentType: string
  alt: string
  className?: string
  controls?: boolean
}) {
  /* ⚠️ Une VIGNETTE de vidéo ne télécharge plus la vidéo.
   *
   * `<video src="blob:…">` exige le fichier ENTIER avant d'afficher la moindre
   * image. Une grille de rapports ou de galerie rapatriait donc jusqu'à 50 Mo
   * par case — pour une case de cent pixels, sur le forfait mobile du parent.
   * C'était le pire cas de loin, et il échouait presque toujours.
   *
   * Contrepartie assumée : la case ne montre plus une image du film. En
   * obtenir une sans tout télécharger demanderait une vignette fabriquée par le
   * serveur, qui n'existe pas encore. La vidéo est téléchargée à l'ouverture
   * (`controls`), c'est-à-dire quand l'utilisateur l'a demandée. */
  const videoTile = isVideo(contentType) && !controls

  const { data: blob, isPending, isError } = useQuery({
    queryKey,
    queryFn: fetchBlob,
    staleTime: Infinity,
    enabled: !videoTile,
    // Un média qui échoue est presque toujours trop lourd pour le lien : le
    // réessayer trois fois (le défaut) rejoue le téléchargement en entier à
    // chaque fois, aux frais du forfait du parent.
    retry: 1,
  })

  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  if (videoTile) {
    return (
      <div className={cn('flex items-center justify-center bg-black', className)}>
        <FileVideo className="size-6 text-white/90" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className={cn('flex items-center justify-center bg-muted', className)}>
        <ImageOff className="size-5 text-muted-foreground" />
      </div>
    )
  }

  /* ⚠️ `!objectUrl` est un état d'ATTENTE, pas une erreur.
   *
   * Il était traité comme un échec : après l'arrivée du fichier, il s'écoule un
   * rendu avant que l'effet ci-dessus ne fabrique l'URL — l'icône « image
   * indisponible » apparaissait donc brièvement sur un média parfaitement
   * valide. De quoi faire chercher une panne là où il n'y en avait pas. */
  if (isPending || !objectUrl) {
    return (
      <div className={cn('flex items-center justify-center bg-muted', className)}>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isVideo(contentType)) {
    return <video src={objectUrl} controls className={cn('bg-black', className)} />
  }

  if (isImage(contentType)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={objectUrl} alt={alt} className={cn('object-cover', className)} />
  }

  return (
    <div className={cn('flex items-center justify-center bg-muted', className)}>
      <ImageOff className="size-5 text-muted-foreground" />
    </div>
  )
}
