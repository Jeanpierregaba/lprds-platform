'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { Reveal } from './reveal'
import { GALLERY, GALLERY_CATEGORIES } from '@/lib/marketing/data'

export function GalleryExplorer() {
  const [filter, setFilter] = useState<(typeof GALLERY_CATEGORIES)[number]['id']>('all')
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const visible = filter === 'all' ? GALLERY : GALLERY.filter((g) => g.category === filter)
  const active = activeIndex !== null ? visible[activeIndex] : null

  const go = (delta: number) => {
    if (activeIndex === null) return
    setActiveIndex((activeIndex + delta + visible.length) % visible.length)
  }

  return (
    <>
      <div className="flex flex-wrap justify-center gap-2">
        {GALLERY_CATEGORIES.map((c) => (
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

      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((item, i) => (
          <Reveal key={item.id} delay={(i % 4) * 0.05}>
            <button
              type="button"
              onClick={() => setActiveIndex(i)}
              className="group relative block aspect-square w-full overflow-hidden rounded-2xl"
            >
              <Image
                src={item.image}
                alt={item.title}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              />
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/0 to-black/0 p-4 opacity-0 transition-opacity group-hover:opacity-100">
                <p className="text-sm font-medium text-white">{item.title}</p>
                <p className="text-xs text-white/75">{item.description}</p>
              </div>
            </button>
          </Reveal>
        ))}
      </div>

      <Dialog open={!!active} onOpenChange={(open) => !open && setActiveIndex(null)}>
        <DialogContent className="max-w-3xl border-none bg-transparent p-0 shadow-none ring-0" showCloseButton={false}>
          {active && (
            <div className="relative">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl sm:aspect-video">
                <Image src={active.image} alt={active.title} fill className="object-cover" sizes="768px" />
              </div>
              <div className="mt-3 text-center text-white">
                <p className="font-display text-lg">{active.title}</p>
                <p className="text-sm text-white/70">{active.description}</p>
              </div>
              <DialogClose
                className="absolute -top-3 -right-3 flex size-9 items-center justify-center rounded-full bg-white text-foreground shadow-lg transition-colors hover:bg-muted"
                aria-label="Fermer"
              >
                <X className="size-4" />
              </DialogClose>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Image précédente"
                className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-lg transition-colors hover:bg-white"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Image suivante"
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
