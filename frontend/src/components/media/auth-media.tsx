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
  const { data: blob, isLoading, isError } = useQuery({
    queryKey,
    queryFn: fetchBlob,
    staleTime: Infinity,
  })

  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center bg-muted', className)}>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError || !objectUrl) {
    return (
      <div className={cn('flex items-center justify-center bg-muted', className)}>
        <ImageOff className="size-5 text-muted-foreground" />
      </div>
    )
  }

  if (isVideo(contentType)) {
    return controls ? (
      <video src={objectUrl} controls className={cn('bg-black', className)} />
    ) : (
      <div className={cn('relative flex items-center justify-center bg-black', className)}>
        <video src={objectUrl} className="size-full object-cover opacity-70" />
        <FileVideo className="absolute size-6 text-white drop-shadow" />
      </div>
    )
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
