'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileVideo, Images } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { AuthMedia } from '@/components/media/auth-media'
import { galleryApi } from '@/lib/api/gallery.api'
import { isVideo, type GalleryMediaItem } from '@/types/gallery'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { ListPagination } from '@/components/dashboard/shared/pagination'
import { MediaLightbox } from '@/app/dashboard/admin/gallery/media-lightbox'

const PAGE_SIZE = 30

export default function StaffGalleryPage() {
  const [skip, setSkip] = useState(0)
  const [selected, setSelected] = useState<GalleryMediaItem | null>(null)

  useEffect(() => setSkip(0), [])

  const { data, isLoading } = useQuery({
    queryKey: ['staff', 'gallery', 'my-uploads', skip],
    queryFn: () => galleryApi.listMyUploads({ skip, limit: PAGE_SIZE }).then((r) => r.data),
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []

  return (
    <PageMotion>
      <PageHeader
        title="Galerie"
        description="Photos et vidéos que vous avez envoyées via vos rapports."
      />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full rounded-md" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Images className="size-5" />
          </div>
          <p className="font-medium text-white">Aucun média envoyé pour le moment.</p>
          <p className="text-sm text-white">Les photos/vidéos jointes à vos rapports apparaîtront ici.</p>
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
                queryKey={['staff', 'gallery-blob', item.id]}
                fetchBlob={() => galleryApi.download(item.url).then((r) => r.data)}
                contentType={item.content_type}
                alt={item.filename}
                className="size-full transition group-hover:scale-105"
              />
              {isVideo(item.content_type) && (
                <FileVideo className="absolute right-1.5 top-1.5 size-4 text-white drop-shadow" />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100">
                <Badge variant="secondary" className="text-[10px]">Rapport</Badge>
              </div>
            </button>
          ))}
        </div>
      )}

      {!isLoading && total > 0 && (
        <ListPagination
          label={<>{total} média{total > 1 ? 's' : ''}</>}
          skip={skip}
          pageSize={PAGE_SIZE}
          total={total}
          onSkipChange={setSkip}
        />
      )}

      <MediaLightbox item={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </PageMotion>
  )
}
