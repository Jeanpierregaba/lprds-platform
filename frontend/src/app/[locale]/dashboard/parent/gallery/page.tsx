'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useState } from 'react'
import { useLabel, useLabelMap } from '@/lib/i18n/labels'
import { useQuery } from '@tanstack/react-query'
import { FileVideo, Images } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AuthMedia } from '@/components/media/auth-media'
import { galleryApi } from '@/lib/api/gallery.api'
import { GALLERY_SOURCES, isVideo, type GalleryMediaItem } from '@/types/gallery'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { ListPagination } from '@/components/dashboard/shared/pagination'
import { MediaLightbox } from '@/app/[locale]/dashboard/admin/gallery/media-lightbox'
import { useMyChildren } from '../use-my-children'

const ALL = '__all__'
const PAGE_SIZE = 30

export default function ParentGalleryPage() {
  const t = useTranslations('admin')
  const tg = useTranslations('gallery')
  const gallerySourceBadgesLabel = useLabel('gallerySourceBadges')
  const gallerySourcesLabels = useLabelMap('gallerySources', GALLERY_SOURCES)
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

  const childItems = { [ALL]: tg('filters.allChildren'), ...Object.fromEntries(children.map((c) => [c.id, `${c.first_names} ${c.last_name}`])) }

  return (
    <PageMotion>
      <PageHeader
        title={t('portals.gallery')}
        description={t('portals.parentGalleryHint')}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select items={{ [ALL]: tg('filters.allSources'), ...gallerySourcesLabels }} value={source} onValueChange={(v) => setSource(v ?? ALL)}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder={tg('filters.allSources')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{tg('filters.allSources')}</SelectItem>
            {Object.entries(gallerySourcesLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>

        {children.length > 1 && (
          <Select items={childItems} value={childId} onValueChange={(v) => setChildId(v ?? ALL)}>
            <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder={tg('filters.allChildren')} /></SelectTrigger>
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
          <p className="font-medium text-white">{tg('empty.parent')}</p>
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
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100 max-sm:opacity-100">
                <Badge variant="secondary" className="text-xs">
                  {gallerySourceBadgesLabel(item.source)}
                </Badge>
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
