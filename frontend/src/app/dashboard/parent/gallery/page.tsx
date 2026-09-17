'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { FileVideo, Images } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AuthMedia } from '@/components/media/auth-media'
import { galleryApi } from '@/lib/api/gallery.api'
import { GALLERY_SOURCE_BADGE_LABEL, GALLERY_SOURCE_LABELS, isVideo, type GalleryMediaItem } from '@/types/gallery'
import { MediaLightbox } from '@/app/dashboard/admin/gallery/media-lightbox'
import { useMyChildren } from '../use-my-children'

const ALL = '__all__'
const PAGE_SIZE = 30

export default function ParentGalleryPage() {
  const [source, setSource] = useState(ALL)
  const [childId, setChildId] = useState(ALL)
  const [skip, setSkip] = useState(0)
  const [selected, setSelected] = useState<GalleryMediaItem | null>(null)
  const { children } = useMyChildren()

  useEffect(() => setSkip(0), [source, childId])

  const { data, isLoading } = useQuery({
    queryKey: ['parent', 'gallery', { source, childId, skip }],
    queryFn: () =>
      galleryApi
        .listMine({
          source: source === ALL ? undefined : (source as GalleryMediaItem['source']),
          child_id: childId === ALL ? undefined : childId,
          skip,
          limit: PAGE_SIZE,
        })
        .then((r) => r.data),
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []
  const hasNext = skip + PAGE_SIZE < total
  const hasPrev = skip > 0

  const childItems = { [ALL]: 'Tous les enfants', ...Object.fromEntries(children.map((c) => [c.id, `${c.first_names} ${c.last_name}`])) }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div>
        <h1 className="text-2xl font-bold">Galerie</h1>
        <p className="text-muted-foreground">Photos et vidéos de votre/vos enfant(s).</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select items={{ [ALL]: 'Toutes les sources', ...GALLERY_SOURCE_LABELS }} value={source} onValueChange={(v) => setSource(v ?? ALL)}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Toutes les sources" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toutes les sources</SelectItem>
            {Object.entries(GALLERY_SOURCE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>

        {children.length > 1 && (
          <Select items={childItems} value={childId} onValueChange={(v) => setChildId(v ?? ALL)}>
            <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Tous les enfants" /></SelectTrigger>
            <SelectContent>
              {Object.entries(childItems).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full rounded-md" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Images className="size-5" />
          </div>
          <p className="font-medium text-white">Aucun média pour le moment.</p>
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
              <AuthMedia
                queryKey={['parent', 'gallery-blob', item.id]}
                fetchBlob={() => galleryApi.download(item.url).then((r) => r.data)}
                contentType={item.content_type}
                alt={item.filename}
                className="size-full transition group-hover:scale-105"
              />
              {isVideo(item.content_type) && (
                <FileVideo className="absolute right-1.5 top-1.5 size-4 text-white drop-shadow" />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100">
                <Badge variant="secondary" className="text-[10px]">
                  {GALLERY_SOURCE_BADGE_LABEL[item.source]}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      )}

      {!isLoading && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>{total} média{total > 1 ? 's' : ''}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>
              Précédent
            </Button>
            <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setSkip(skip + PAGE_SIZE)}>
              Suivant
            </Button>
          </div>
        </div>
      )}

      <MediaLightbox item={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </motion.div>
  )
}
