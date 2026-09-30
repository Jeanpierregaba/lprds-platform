'use client'

import { useTranslations } from 'next-intl'

import { CheckCheck, FileSearch, FileWarning, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils/cn'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { SearchInput, ViewToggle, type ViewMode } from '@/components/dashboard/shared/filters'
import { CardsEmptyState, CardsGrid, StaggerItem } from '@/components/dashboard/shared/cards'
import type { MissingReportResponse } from '@/types/reports'
import { useState } from 'react'
import { Link } from '@/i18n/navigation'

function normalize(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Enfants sans rapport soumis pour la période contenant `date` — remplace
 * l'ancien aller-retour vers la liste des absences. Les données viennent de
 * l'onglet parent (même requête que le compteur du pill — jamais deux clés
 * identiques avec deux lectures différentes). */
export function MissingList({
  date, onDateChange, search, onSearchChange, data, isLoading,
}: {
  date: string
  onDateChange: (date: string) => void
  search: string
  onSearchChange: (value: string) => void
  data: MissingReportResponse | undefined
  isLoading: boolean
}) {
  const t = useTranslations('reports')
  const today = new Date().toISOString().slice(0, 10)
  const [view, setView] = useState<ViewMode>('cards')
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('reports:write')

  const q = normalize(search.trim())
  const items = (data?.items ?? []).filter((item) =>
    !q ||
    normalize(`${item.child.first_names} ${item.child.last_name}`).includes(q) ||
    normalize(item.child.matricule).includes(q)
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <SearchInput
            placeholder={t('missing.search')}
            value={search}
            onChange={onSearchChange}
            inputClassName="h-9"
          />
          <div className="flex items-center gap-2">
            <Label htmlFor="missing-date" className="text-sm text-white font-semibold">Date</Label>
            <Input
              id="missing-date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => e.target.value && onDateChange(e.target.value)}
              className="h-9 w-40"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          {canWrite && (
            <Button render={<Link href="/dashboard/admin/reports/new" />}>
              <Plus className="mr-1.5 size-4" />
              Nouveau rapport
            </Button>
          )}
        </div>
      </div>

      {!isLoading && data && (
        <p className="text-sm text-white font-medium">{t('periodLabel')}<span className="font-medium text-white font-semibold">{data.period_label}</span>
          {' · '}{data.total} enfant{data.total > 1 ? 's' : ''} sans rapport soumis
        </p>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="space-y-2 p-5">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <CardsEmptyState
          icon={q ? FileSearch : CheckCheck}
          iconClassName={q ? undefined : 'bg-pale-green/15 text-pale-green'}
          title={q ? t('missing.emptySearch') : t('missing.allSubmitted')}
        />
      ) : view === 'cards' ? (
        <CardsGrid>
          {items.map((item, i) => (
            <StaggerItem key={item.child.id} index={i}>
              <Card className="rounded-2xl shadow-soft">
                <CardContent className="space-y-1.5 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 break-words font-display text-xl font-semibold leading-tight">
                      {item.child.first_names} {item.child.last_name}
                    </p>
                    <span
                      className={cn(
                        'shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold',
                        item.has_draft
                          ? 'bg-warning text-warning-foreground'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {item.has_draft ? t('missing.hasDraft') : t('missing.nothing')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Code: <span className="font-mono">{item.child.matricule}</span>
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">Section:</span> {item.section_name ?? '—'}
                  </p>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </CardsGrid>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.child.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {item.child.first_names} {item.child.last_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.section_name ?? '—'} · <span className="font-mono">{item.child.matricule}</span>
                    </p>
                  </div>
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
                      item.has_draft
                        ? 'bg-warning text-warning-foreground'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {!item.has_draft && <FileWarning className="size-3.5" />}
                    {item.has_draft ? t('missing.hasDraft') : t('missing.nothing')}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
