'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useState } from 'react'
import { intlLocale } from '@/lib/utils/locale-format'
import { useLabel } from '@/lib/i18n/labels'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowRight, Award, CalendarRange, FileText, Sun } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { reportsApi } from '@/lib/api/reports.api'
import { type ReportType } from '@/types/reports'
import { cn } from '@/lib/utils/cn'
import { PageMotion } from '@/components/dashboard/shared/page'
import { CardsEmptyState } from '@/components/dashboard/shared/cards'
import { ListPagination } from '@/components/dashboard/shared/pagination'
import { useMyChildren } from '../use-my-children'
import { Link } from '@/i18n/navigation'

const ALL = '__all__'
const PAGE_SIZE = 21

const TYPE_STYLE: Record<ReportType, { tint: string; soft: string; icon: typeof Sun }> = {
  quotidien:   { tint: 'bg-sky',     soft: 'bg-sky/15 text-sky',         icon: Sun },
  bi_mensuel:  { tint: 'bg-teal',    soft: 'bg-teal/15 text-teal',       icon: CalendarRange },
  annuel:      { tint: 'bg-primary', soft: 'bg-primary/15 text-primary', icon: Award },
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric' })
}

function initials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

export default function ParentReportsPage() {
  const t = useTranslations('reports')
  const reportTypesLabel = useLabel('reportTypes')
  const [childId, setChildId] = useState(ALL)
  const [skip, setSkip] = useState(0)
  const { children } = useMyChildren()

  useEffect(() => setSkip(0), [childId])

  const { data, isLoading } = useQuery({
    queryKey: ['parent', 'reports-mine', { childId, skip }],
    queryFn: () =>
      reportsApi
        .listMine({ child_id: childId === ALL ? undefined : childId, skip, limit: PAGE_SIZE })
        .then((r) => r.data),
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []

  const childItems = { [ALL]: t('parent.allChildren'), ...Object.fromEntries(children.map((c) => [c.id, `${c.first_names} ${c.last_name}`])) }

  return (
    <PageMotion>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('parent.title')}</h1>
          <p className="text-muted-foreground">{t('parent.description')}</p>
        </div>
        {children.length > 1 && (
          <Select items={childItems} value={childId} onValueChange={(v) => setChildId(v ?? ALL)}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder={t('parent.allChildren')} />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(childItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-2xl" />)}
        </div>
      ) : items.length === 0 ? (
        <CardsEmptyState
          icon={FileText}
          title={t('portal.empty')}
          description={t('portal.emptyHint')}
          heightClass="h-48"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((r, i) => {
            const style = TYPE_STYLE[r.report_type]
            const Icon = style.icon
            const published = formatDate(r.validated_at)
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.4) }}
              >
                <Link href={`/dashboard/parent/reports/${r.id}`}>
                  <Card
                    className={cn(
                      'group relative h-full overflow-hidden transition hover:-translate-y-0.5 hover:shadow-soft',
                      !r.is_read && 'ring-1 ring-primary/40'
                    )}
                  >
                    <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-1.5', style.tint)} />
                    <CardContent className="space-y-3 p-5 pt-6">
                      <div className="flex items-center gap-3">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-navy font-display text-sm font-semibold text-white">
                          {initials(r.child.first_names, r.child.last_name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-display text-lg font-semibold leading-tight">
                            {r.child.first_names} {r.child.last_name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{r.period_label}</p>
                        </div>
                        {!r.is_read && <Badge variant="default" className="shrink-0">Nouveau</Badge>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium', style.soft)}>
                          <Icon className="size-3.5 shrink-0" />
                          {reportTypesLabel(r.report_type)}
                        </span>
                        {published && <span className="text-xs text-muted-foreground">Publié le {published}</span>}
                      </div>
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-sky">
                        Lire le rapport
                        <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            )
          })}
        </div>
      )}

      {!isLoading && total > PAGE_SIZE && (
        <ListPagination
          label={<>{total} rapports</>}
          skip={skip}
          pageSize={PAGE_SIZE}
          total={total}
          onSkipChange={setSkip}
        />
      )}
    </PageMotion>
  )
}
