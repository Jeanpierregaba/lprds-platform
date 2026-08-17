'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { FileVideo, Images } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { AuthMedia } from '@/components/media/auth-media'
import { galleryApi } from '@/lib/api/gallery.api'
import { isVideo } from '@/types/gallery'
import { downloadBlob } from '@/lib/utils/download'
import { getApiErrorMessage } from '@/lib/utils/api-error'

const PAGE_SIZE = 30

export default function StaffGalleryPage() {
  const [skip, setSkip] = useState(0)

  useEffect(() => setSkip(0), [])

  const { data, isLoading } = useQuery({
    queryKey: ['staff', 'gallery', 'my-uploads', skip],
    queryFn: () => galleryApi.listMyUploads({ skip, limit: PAGE_SIZE }).then((r) => r.data),
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
        <p className="text-muted-foreground">Photos et vidéos que vous avez envoyées via vos rapports.</p>
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
          <p className="font-medium text-foreground">Aucun média envoyé pour le moment.</p>
          <p className="text-sm">Les photos/vidéos jointes à vos rapports apparaîtront ici.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={async () => {
                try {
                  const res = await galleryApi.download(item.url)
                  downloadBlob(res.data, item.filename)
                } catch (err) {
                  toast.error(getApiErrorMessage(err))
                }
              }}
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
        <div className="flex items-center justify-between text-sm text-muted-foreground">
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
    </motion.div>
  )
}
