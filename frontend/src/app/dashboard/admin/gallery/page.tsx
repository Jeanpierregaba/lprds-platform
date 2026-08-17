'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { FileVideo, Images } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { galleryApi } from '@/lib/api/gallery.api'
import { isVideo, type GalleryMediaItem } from '@/types/gallery'
import { GalleryFilters, EMPTY_FILTERS, toParams, type GalleryFilterState } from './gallery-filters'
import { MediaThumb } from './media-thumb'
import { MediaLightbox } from './media-lightbox'

const PAGE_SIZE = 30

export default function GalleryPage() {
  const [filters, setFilters] = useState<GalleryFilterState>(EMPTY_FILTERS)
  const [skip, setSkip] = useState(0)
  const [selected, setSelected] = useState<GalleryMediaItem | null>(null)

  useEffect(() => setSkip(0), [filters])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['gallery', 'media', filters, skip],
    queryFn: () => galleryApi.list({ ...toParams(filters), skip, limit: PAGE_SIZE }).then((r) => r.data),
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []
  const hasNext = skip + PAGE_SIZE < total
  const hasPrev = skip > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div>
        <h1 className="text-2xl font-bold">Galerie</h1>
        <p className="text-muted-foreground">Photos et vidéos issues des rapports et de la messagerie.</p>
      </div>

      <GalleryFilters filters={filters} onChange={setFilters} />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full rounded-md" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Images className="size-5" />
          </div>
          <p className="font-medium text-foreground">Aucun média trouvé.</p>
          <p className="text-sm">Essayez d&apos;élargir vos filtres.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item)}
              className="group relative aspect-square overflow-hidden rounded-md ring-1 ring-border transition hover:ring-primary"
            >
              <MediaThumb item={item} className="size-full transition group-hover:scale-105" />
              {isVideo(item.content_type) && (
                <FileVideo className="absolute right-1.5 top-1.5 size-4 text-white drop-shadow" />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100">
                <Badge variant="secondary" className="text-[10px]">
                  {item.source === 'report' ? 'Rapport' : 'Messagerie'}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      )}

      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} média{total > 1 ? 's' : ''}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!hasPrev || isFetching} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>
              Précédent
            </Button>
            <Button variant="outline" size="sm" disabled={!hasNext || isFetching} onClick={() => setSkip(skip + PAGE_SIZE)}>
              Suivant
            </Button>
          </div>
        </div>
      )}

      <MediaLightbox item={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </motion.div>
  )
}
