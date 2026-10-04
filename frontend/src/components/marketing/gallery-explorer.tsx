'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Reveal } from './reveal'
import type { GalleryPhotoCategory } from '@/types/blog'
import { thumbUrl } from '@/lib/media/thumb'

export type LiveGalleryItem = {
  id: string
  category: GalleryPhotoCategory | null
  url: string
}

export function GalleryExplorer({
  items, categories,
}: {
  items: LiveGalleryItem[]
  categories: GalleryPhotoCategory[]
}) {
  const [filter, setFilter] = useState<string>('all')
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const visible = filter === 'all' ? items : items.filter((g) => g.category?.id === filter)
  const active = activeIndex !== null ? visible[activeIndex] : null
  const t = useTranslations('marketing.galleryPage')
  const categoryName = (id: string | null) =>
    id === null ? t('uncategorised') : categories.find((c) => c.id === id)?.name ?? t('uncategorised')

  const go = (delta: number) => {
    if (activeIndex === null || visible.length === 0) return
    setActiveIndex((activeIndex + delta + visible.length) % visible.length)
  }

  return (
    <>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          key="all"
          type="button"
          onClick={() => { setFilter('all'); setActiveIndex(null) }}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            filter === 'all'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
          }`}
        >
          {t('seeAll')}
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => { setFilter(c.id); setActiveIndex(null) }}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              filter === c.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="mt-10 rounded-2xl bg-muted/60 py-16 text-center">
          <p className="font-medium text-foreground">
            {items.length === 0
              ? t('emptyAll')
              : t('emptyCategory')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('emptyHint')}
          </p>
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((item, i) => (
            <Reveal key={item.id} delay={(i % 4) * 0.05}>
              <button
                type="button"
                onClick={() => setActiveIndex(i)}
                className="group relative block aspect-square w-full overflow-hidden rounded-2xl"
              >
                <Image
                  src={thumbUrl(item.url)}
                  alt={categoryName(item.category?.id ?? null)}
                  fill
                  unoptimized
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                />
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/0 to-black/0 p-4 opacity-0 transition-opacity group-hover:opacity-100">
                  <p className="text-sm font-medium text-white">{categoryName(item.category?.id ?? null)}</p>
                </div>
              </button>
            </Reveal>
          ))}
        </div>
      )}

      <Dialog open={!!active} onOpenChange={(open) => !open && setActiveIndex(null)}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-3xl border-none bg-transparent p-0 shadow-none ring-0" showCloseButton={false}>
          {active && (
            <div className="relative">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl sm:aspect-video">
                <Image src={active.url} alt={categoryName(active.category?.id ?? null)} fill unoptimized className="object-cover" sizes="(max-width: 768px) 100vw, 768px" />
              </div>
              <div className="mt-3 text-center text-white">
                <p className="font-display text-lg">{categoryName(active.category?.id ?? null)}</p>
              </div>
              <DialogClose
                className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-white text-foreground shadow-lg transition-colors hover:bg-muted"
                aria-label={t('close')}
              >
                <X className="size-4" />
              </DialogClose>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label={t('previous')}
                className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-lg transition-colors hover:bg-white"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label={t('next')}
                className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-lg transition-colors hover:bg-white"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}