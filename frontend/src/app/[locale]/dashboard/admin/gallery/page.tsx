'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useState } from 'react'
import { useLabel } from '@/lib/i18n/labels'
import { useQuery } from '@tanstack/react-query'
import { FileVideo, Images } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { galleryApi } from '@/lib/api/gallery.api'
import { useUser } from '@/lib/stores/auth.store'
import { isVideo, type GalleryMediaItem } from '@/types/gallery'
import { ModuleGuard, PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { GalleryFilters, EMPTY_FILTERS, toParams, type GalleryFilterState } from './gallery-filters'
import { MediaThumb } from './media-thumb'
import { MediaLightbox } from './media-lightbox'

const PAGE_SIZE = 30

export default function GalleryPage() {
  const t = useTranslations('gallery')
  const tCommon = useTranslations('common')
  const gallerySourceBadgesLabel = useLabel('gallerySourceBadges')
  const user = useUser()
  const staffReportsOnly = user?.role === 'staff'
  const [filters, setFilters] = useState<GalleryFilterState>(EMPTY_FILTERS)
  const [skip, setSkip] = useState(0)
  const [selected, setSelected] = useState<GalleryMediaItem | null>(null)

  useEffect(() => setSkip(0), [filters])

  const effectiveFilters = staffReportsOnly ? { ...filters, source: 'report' } : filters

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['gallery', 'media', effectiveFilters, skip],
    queryFn: () => galleryApi.list({ ...toParams(effectiveFilters), skip, limit: PAGE_SIZE }).then((r) => r.data),
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []
  const hasNext = skip + PAGE_SIZE < total
  const hasPrev = skip > 0

  return (
    <PageMotion>
      <ModuleGuard anyOf={['gallery:read']}>
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
      />

      <GalleryFilters filters={filters} onChange={setFilters} hideSource={staffReportsOnly} />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full rounded-md" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Images className="size-5" />
          </div>
          <p className="font-medium text-white">{t('empty.admin')}</p>
          <p className="text-sm text-white">{t('empty.adminHint')}</p>
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
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 max-sm:opacity-100">
                <Badge variant="secondary" className="text-xs">
                  {gallerySourceBadgesLabel(item.source)}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      )}

      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{t('page.count', { count: total })}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!hasPrev || isFetching} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>
              {tCommon('actions.previous')}
            </Button>
            <Button variant="outline" size="sm" disabled={!hasNext || isFetching} onClick={() => setSkip(skip + PAGE_SIZE)}>
              {tCommon('actions.next')}
            </Button>
          </div>
        </div>
      )}

      <MediaLightbox item={selected} onOpenChange={(open) => !open && setSelected(null)} />
      </ModuleGuard>
    </PageMotion>
  )
}
