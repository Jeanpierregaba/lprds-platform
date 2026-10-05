'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { Clock, Sparkles, Sun, Sunrise, Sunset, Users, X } from 'lucide-react'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Reveal } from './reveal'
import { SectionPinCard, sectionPinIcon } from './section-pin-card'
import { buildSections, type SectionAgeGroup } from '@/lib/marketing/data'

const CATEGORY_IDS = ['all', 'creche', 'garderie', 'maternelle'] as const

const SCHEDULE_META = [
  { key: 'morning' as const, Icon: Sunrise },
  { key: 'midday' as const, Icon: Sun },
  { key: 'afternoon' as const, Icon: Sunset },
]

export function SectionsExplorer() {
  const t = useTranslations('marketing')
  const tUi = useTranslations('marketing.explorer')
  const [filter, setFilter] = useState<(typeof CATEGORY_IDS)[number]>('all')
  const [active, setActive] = useState<SectionAgeGroup | null>(null)

  const sections = buildSections(t)
  const visible = filter === 'all' ? sections : sections.filter((s) => s.category === filter)

  return (
    <>
      <div className="flex flex-wrap justify-center gap-2">
        {CATEGORY_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              filter === id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
            }`}
          >
            {tUi(`filters.${id}`)}
          </button>
        ))}
      </div>

      <div className="mt-10 grid grid-cols-1 items-start gap-10 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3">
        {visible.map((section, i) => {
          const index = sections.findIndex((s) => s.id === section.id)
          const Icon = sectionPinIcon(section)
          return (
            <Reveal key={section.id} delay={(i % 3) * 0.06}>
              <button
                type="button"
                onClick={() => setActive(section)}
                aria-label={tUi('openDetail', { title: section.title })}
                className="group relative block h-full w-full text-left"
              >
                <SectionPinCard
                  index={index}
                  icon={Icon}
                  title={section.shortTitle}
                  subtitle={section.ageRange}
                  description={section.description}
                  footer={
                    <span className="mt-3 flex items-center gap-3 text-xs text-white/85">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="size-3.5" />
                        {section.capacity}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Sparkles className="size-3.5" />
                        {tUi('activityCount', { count: section.activities.length })}
                      </span>
                    </span>
                  }
                />
              </button>
            </Reveal>
          )
        })}
      </div>

      <Dialog open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl" showCloseButton={false}>
          {active && (
            <>
              <div className="relative -mx-6 -mt-6 aspect-[16/9] overflow-hidden sm:rounded-t-lg">
                <Image src={active.image} alt={active.title} fill className="object-cover" sizes="640px" />
                <DialogClose
                  className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
                  aria-label={tUi('close')}
                >
                  <X className="size-4" />
                </DialogClose>
              </div>
              <DialogHeader className="pt-2">
                <DialogTitle className="font-display text-2xl text-primary">{active.title}</DialogTitle>
                <DialogDescription>{active.description}</DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-3 gap-2 rounded-2xl bg-muted/60 p-3 text-center text-sm sm:gap-3 sm:p-4">
                <div className="min-w-0">
                  <div className="break-words font-display text-base text-primary sm:text-lg">{active.ageRange}</div>
                  <div className="text-xs text-muted-foreground">{tUi('age')}</div>
                </div>
                <div className="min-w-0">
                  <div className="break-words font-display text-base text-primary sm:text-lg">{active.capacity}</div>
                  <div className="text-xs text-muted-foreground">{tUi('capacity')}</div>
                </div>
                <div className="min-w-0">
                  <div className="break-words font-display text-base text-primary sm:text-lg">{active.ratio}</div>
                  <div className="text-xs text-muted-foreground">{tUi('ratio')}</div>
                </div>
              </div>

              <div>
                <h4 className="flex items-center gap-2 font-display text-base text-primary">
                  <Sparkles className="size-4 text-accent" />
                  {tUi('activitiesHeading')}
                </h4>
                <ul className="mt-3 space-y-2">
                  {active.activities.map((a) => (
                    <li key={a} className="flex gap-2.5 text-sm text-muted-foreground">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="flex items-center gap-2 font-display text-base text-primary">
                  <Clock className="size-4 text-accent" />
                  {tUi('dayHeading')}
                </h4>
                <div className="mt-3 space-y-3">
                  {SCHEDULE_META.filter(({ key }) => active.schedule[key]).map(({ key, Icon }) => (
                    <div key={key} className="flex gap-3 rounded-xl bg-muted/50 p-3">
                      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-primary/70">{tUi(`schedule.${key}`)}</div>
                        <p className="mt-0.5 text-sm text-muted-foreground">{active.schedule[key]}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
