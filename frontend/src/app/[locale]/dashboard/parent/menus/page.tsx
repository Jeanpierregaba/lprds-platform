'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useState } from 'react'
import { intlLocale } from '@/lib/utils/locale-format'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, UtensilsCrossed } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MenuWeekTable } from '@/components/menus/menu-week-table'
import { menusApi } from '@/lib/api/menus.api'
import { addDays, mondayOf, parseIsoDate, toIsoDate } from '@/lib/utils/dates'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import type { Menu, Weekday } from '@/types/menus'

function formatDate(iso: string) {
  return parseIsoDate(iso).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatShortDate(iso: string) {
  return parseIsoDate(iso).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' })
}

export default function ParentMenusPage() {
  const tMenus = useTranslations('menus')
  const t = useTranslations('admin')
  const currentMonday = toIsoDate(mondayOf(new Date()))
  const [weekStart, setWeekStart] = useState(currentMonday)
  const [deptId, setDeptId] = useState('')

  const today = toIsoDate(new Date())
  const isCurrentWeek = weekStart === currentMonday
  const weekEnd = toIsoDate(addDays(parseIsoDate(weekStart), 4))
  const dayDates: Record<Weekday, string> = {
    monday: weekStart,
    tuesday: toIsoDate(addDays(parseIsoDate(weekStart), 1)),
    wednesday: toIsoDate(addDays(parseIsoDate(weekStart), 2)),
    thursday: toIsoDate(addDays(parseIsoDate(weekStart), 3)),
    friday: weekEnd,
  }

  // Départements de MES enfants (parent multi-départements = plusieurs onglets).
  const { data: departments = [] } = useQuery({
    queryKey: ['parent', 'menus', 'departments'],
    queryFn: () => menusApi.getVisibleDepartments().then((r) => r.data.items),
  })

  useEffect(() => {
    const first = departments[0]
    if (!deptId && first) setDeptId(first.id)
  }, [deptId, departments])

  const deptIdsKey = departments.map((d) => d.id).join(',')
  const { data: currentItems = [], isLoading: loadingCurrent } = useQuery({
    queryKey: ['parent', 'menus', 'current'],
    queryFn: () => menusApi.getCurrent().then((r) => r.data.items),
    enabled: isCurrentWeek,
  })
  const { data: weekItems = [], isLoading: loadingWeek } = useQuery({
    // deptIdsKey fige la liste des départements dans la clé de cache.
    queryKey: ['parent', 'menus', 'week', weekStart, deptIdsKey],
    queryFn: async () => {
      const results = await Promise.all(
        departments.map(async (d) => {
          const res = await menusApi.get(weekStart, d.id)
          return res.status === 200 ? res.data : null
        })
      )
      return results.filter((m): m is Menu => m !== null)
    },
    enabled: !isCurrentWeek && departments.length > 0,
  })

  const isLoading = isCurrentWeek ? loadingCurrent : loadingWeek
  const menu = (isCurrentWeek ? currentItems : weekItems).find((m) => m.department_id === deptId) ?? null

  return (
    <PageMotion>
      <PageHeader
        title={t('portals.menus')}
        description={t('portals.menusHint')}
      />

      {departments.length > 1 && (
        <Tabs value={deptId} onValueChange={(v) => v && setDeptId(v)}>
          <TabsList>
            {departments.map((d) => (
              <TabsTrigger key={d.id} value={d.id}>{d.name}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Semaine du {formatDate(weekStart)} — au {formatDate(weekEnd)}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            className="h-10 w-10"
            disabled={isCurrentWeek}
            onClick={() => setWeekStart(toIsoDate(addDays(parseIsoDate(weekStart), -7)))}
            aria-label={tMenus('week.prevWeek')}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" className="h-10" disabled={isCurrentWeek} onClick={() => setWeekStart(currentMonday)}>{t('thisWeek')}</Button>
          <Button
            variant="outline"
            size="icon-sm"
            className="h-10 w-10"
            onClick={() => setWeekStart(toIsoDate(addDays(parseIsoDate(weekStart), 7)))}
            aria-label="Semaine suivante"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !menu ? (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <UtensilsCrossed className="size-5" />
              </div>
              <p className="font-medium text-foreground">{tMenus('parent.empty')}</p>
            </div>
          ) : (
            <MenuWeekTable menu={menu} dayDates={dayDates} today={today} formatShortDate={formatShortDate} />
          )}
        </CardContent>
      </Card>
    </PageMotion>
  )
}
