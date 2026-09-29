'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useState } from 'react'
import { intlLocale } from '@/lib/utils/locale-format'
import { useLabel } from '@/lib/i18n/labels'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Coffee, Cookie, IceCream2, Loader2, Utensils } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { menusApi } from '@/lib/api/menus.api'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { addDays, mondayOf, parseIsoDate, toIsoDate } from '@/lib/utils/dates'
import {
  MEAL_SLOTS, WEEKDAYS, emptyWeek,
  type DayMenu, type MealSlot, type Weekday, type WeekContent,
} from '@/types/menus'

const MEAL_SLOT_ICONS: Record<MealSlot, React.ElementType> = {
  collation: Coffee,
  dejeuner: Utensils,
  dessert: IceCream2,
  gouter: Cookie,
}

function formatDate(iso: string) {
  return parseIsoDate(iso).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatShortDate(iso: string) {
  return parseIsoDate(iso).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' })
}

export function WeekTab({
  weekStart, onWeekStartChange, departmentId, onDepartmentChange,
}: {
  weekStart: string
  onWeekStartChange: (weekStart: string) => void
  departmentId: string
  onDepartmentChange: (departmentId: string) => void
}) {
  const t = useTranslations('menus')
  const mealSlotsLabel = useLabel('mealSlots')
  const weekdaysLabel = useLabel('weekdays')
  const queryClient = useQueryClient()
  const [content, setContent] = useState<WeekContent>(emptyWeek())

  const today = toIsoDate(new Date())
  const currentMonday = toIsoDate(mondayOf(new Date()))
  const isPast = weekStart < currentMonday
  const weekEnd = toIsoDate(addDays(parseIsoDate(weekStart), 4))
  const dayDates: Record<Weekday, string> = {
    monday: weekStart,
    tuesday: toIsoDate(addDays(parseIsoDate(weekStart), 1)),
    wednesday: toIsoDate(addDays(parseIsoDate(weekStart), 2)),
    thursday: toIsoDate(addDays(parseIsoDate(weekStart), 3)),
    friday: weekEnd,
  }

  const { data: menu, isLoading, isFetching } = useQuery({
    queryKey: ['menus', 'week', weekStart, departmentId],
    queryFn: async () => {
      if (!departmentId) return null
      const res = await menusApi.get(weekStart, departmentId)
      return res.status === 200 ? res.data : null
    },
  })

  const { data: departments = [] } = useQuery({
    queryKey: ['menus', 'visible-departments'],
    queryFn: () => menusApi.getVisibleDepartments().then((r) => r.data.items),
  })

  // Département par défaut : le premier de la liste dès qu'elle arrive.
  useEffect(() => {
    const first = departments[0]
    if (!departmentId && first) onDepartmentChange(first.id)
  }, [departmentId, departments, onDepartmentChange])

  useEffect(() => {
    if (menu) {
      setContent({
        monday: menu.monday, tuesday: menu.tuesday, wednesday: menu.wednesday,
        thursday: menu.thursday, friday: menu.friday,
      })
    } else {
      setContent(emptyWeek())
    }
  }, [menu])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['menus', 'week', weekStart, departmentId] })
    queryClient.invalidateQueries({ queryKey: ['menus', 'history'] })
  }

  const normalizeDay = (day: DayMenu): DayMenu => ({
    collation: day.collation?.trim() ? day.collation : null,
    dejeuner: day.dejeuner?.trim() ? day.dejeuner : null,
    dessert: day.dessert?.trim() ? day.dessert : null,
    gouter: day.gouter?.trim() ? day.gouter : null,
  })

  const normalizeContent = (c: WeekContent): WeekContent => ({
    monday: normalizeDay(c.monday),
    tuesday: normalizeDay(c.tuesday),
    wednesday: normalizeDay(c.wednesday),
    thursday: normalizeDay(c.thursday),
    friday: normalizeDay(c.friday),
  })

  const createMutation = useMutation({
    mutationFn: () => menusApi.create({ week_start: weekStart, department_id: departmentId, ...normalizeContent(content) }),
    onSuccess: () => { toast.success(t('week.created')); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const updateMutation = useMutation({
    mutationFn: () => menusApi.update(weekStart, departmentId, normalizeContent(content)),
    onSuccess: () => { toast.success(t('week.saved')); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => menusApi.remove(weekStart, departmentId),
    onSuccess: () => { toast.success(t('week.deleted')); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const setCell = (day: Weekday, slot: MealSlot, value: string) => {
    setContent((prev) => ({ ...prev, [day]: { ...prev[day], [slot]: value } }))
  }

  const isEditable = !isPast && !!departmentId
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('menus:write')
  const isSaving = createMutation.isPending || updateMutation.isPending
  const showEmptyPastState = !menu && isPast && !isLoading

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="menu-department" className="text-white font-semibold">{t('week.department')}</Label>
          <Select
            items={Object.fromEntries(departments.map((d) => [d.id, d.name]))}
            value={departmentId}
            onValueChange={(v) => v && onDepartmentChange(v)}
          >
            <SelectTrigger id="menu-department" className="h-9 w-full sm:w-52">
              <SelectValue placeholder={t('week.chooseDepartment')} />
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" className="h-10 w-10" onClick={() => onWeekStartChange(toIsoDate(addDays(parseIsoDate(weekStart), -7)))} aria-label="Semaine précédente">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" className="h-10" onClick={() => onWeekStartChange(currentMonday)}>
            Aujourd&apos;hui
          </Button>
          <Button variant="outline" size="icon-sm" className="h-10 w-10" onClick={() => onWeekStartChange(toIsoDate(addDays(parseIsoDate(weekStart), 7)))} aria-label="Semaine suivante">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-white">{t('week.weekRange', { from: formatDate(weekStart) })} <br />{t('week.weekTo', { to: formatDate(weekEnd) })}</h2>
      </div>

      {departments.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {t('week.noDepartment')}
          </CardContent>
        </Card>
      )}
      {departments.length > 0 && (
      <>
      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : showEmptyPastState ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t('week.noMenu')}</p>
          ) : (
            <>
              <div className="hidden lg:block">
                <Table className="border-collapse">
                  <TableHeader className="bg-primary [&_tr]:border-transparent">
                    <TableRow className="bg-primary hover:bg-primary">
                      <TableHead className="w-40 px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Repas</TableHead>
                      {WEEKDAYS.map((day) => {
                        const isToday = dayDates[day] === today
                        return (
                          <TableHead key={day} className="px-5 py-4 text-center text-xs font-semibold uppercase tracking-wide text-primary-foreground">
                            <div>{weekdaysLabel(day)}</div>
                            <div className="text-xs font-normal normal-case text-primary-foreground/70">{formatShortDate(dayDates[day])}</div>
                            {isToday && <Badge className="mt-1 border-transparent bg-navy text-white">Aujourd&apos;hui</Badge>}
                          </TableHead>
                        )
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MEAL_SLOTS.map((slot) => {
                      const Icon = MEAL_SLOT_ICONS[slot]
                      return (
                        <TableRow key={slot}>
                          <TableCell className="px-5 py-4 font-medium">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Icon className="size-4" />
                              <span className="text-foreground">{mealSlotsLabel(slot)}</span>
                            </div>
                          </TableCell>
                          {WEEKDAYS.map((day) => (
                            <TableCell key={day} className="whitespace-normal px-5 py-4">
                              <Input
                                value={content[day][slot] ?? ''}
                                onChange={(e) => setCell(day, slot, e.target.value)}
                                disabled={!isEditable || !canWrite}
                                placeholder="—"
                                className="min-w-36"
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="divide-y divide-border lg:hidden">
                {WEEKDAYS.map((day) => {
                  const isToday = dayDates[day] === today
                  return (
                    <div key={day} className="px-4 py-3">
                      <div className="mb-2 flex items-center gap-2">
                        <h3 className="font-medium">{weekdaysLabel(day)}</h3>
                        <span className="text-sm text-muted-foreground">{formatShortDate(dayDates[day])}</span>
                        {isToday && <Badge variant="default">{t('week.today')}</Badge>}
                      </div>
                      <div className="space-y-2">
                        {MEAL_SLOTS.map((slot) => {
                          const Icon = MEAL_SLOT_ICONS[slot]
                          return (
                            <div key={slot}>
                              <label className="mb-0.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                                <Icon className="size-4" />
                                {mealSlotsLabel(slot)}
                              </label>
                              <Input
                                value={content[day][slot] ?? ''}
                                onChange={(e) => setCell(day, slot, e.target.value)}
                                disabled={!isEditable || !canWrite}
                                placeholder="—"
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {isEditable && canWrite && !showEmptyPastState && !isLoading && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => (menu ? updateMutation.mutate() : createMutation.mutate())}
            disabled={isSaving || isFetching}
          >
            {isSaving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            {menu ? t('week.save') : t('week.createWeek')}
          </Button>
          {menu && (
            <AlertDialog>
              <AlertDialogTrigger render={<Button type="button" variant="destructive" />}>
                Supprimer
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('week.deleteTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('week.deleteBody')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('week.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMutation.mutate()}>{t('week.delete')}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      {isPast && !showEmptyPastState && (
        <p className="text-sm text-muted-foreground">Semaine passée — lecture seule.</p>
      )}
      </>
      )}
    </div>
  )
}
