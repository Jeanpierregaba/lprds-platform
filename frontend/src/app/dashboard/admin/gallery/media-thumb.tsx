'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileVideo, ImageOff, Loader2 } from 'lucide-react'

import { galleryApi } from '@/lib/api/gallery.api'
import { isImage, isVideo, type GalleryMediaItem } from '@/types/gallery'
import { cn } from '@/lib/utils'

export function MediaThumb({
  item, className, controls = false,
}: { item: GalleryMediaItem; className?: string; controls?: boolean }) {
  const { data: blob, isLoading, isError } = useQuery({
    queryKey: ['gallery', 'blob', item.id],
    queryFn: () => galleryApi.download(item.url).then((r) => r.data),
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

  if (isVideo(item.content_type)) {
    return controls ? (
      <video src={objectUrl} controls className={cn('bg-black', className)} />
    ) : (
      <div className={cn('relative flex items-center justify-center bg-black', className)}>
        <video src={objectUrl} className="size-full object-cover opacity-70" />
        <FileVideo className="absolute size-6 text-white drop-shadow" />
      </div>
    )
  }

  if (isImage(item.content_type)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={objectUrl} alt={item.filename} className={cn('object-cover', className)} />
  }

  return (
    <div className={cn('flex items-center justify-center bg-muted', className)}>
      <ImageOff className="size-5 text-muted-foreground" />
    </div>
  )
}
