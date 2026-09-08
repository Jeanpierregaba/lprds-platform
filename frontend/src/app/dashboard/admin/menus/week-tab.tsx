'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Coffee, Cookie, IceCream2, Loader2, Utensils } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { menusApi } from '@/lib/api/menus.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { addDays, mondayOf, parseIsoDate, toIsoDate } from '@/lib/utils/dates'
import { cn } from '@/lib/utils'
import {
  MEAL_SLOTS, MEAL_SLOT_LABELS, WEEKDAYS, WEEKDAY_LABELS, emptyWeek,
  type DayMenu, type MealSlot, type Weekday, type WeekContent,
} from '@/types/menus'

const MEAL_SLOT_ICONS: Record<MealSlot, React.ElementType> = {
  collation: Coffee,
  dejeuner: Utensils,
  dessert: IceCream2,
  gouter: Cookie,
}

function formatDate(iso: string) {
  return parseIsoDate(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatShortDate(iso: string) {
  return parseIsoDate(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function WeekTab({
  weekStart, onWeekStartChange,
}: { weekStart: string; onWeekStartChange: (weekStart: string) => void }) {
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
    queryKey: ['menus', 'week', weekStart],
    queryFn: async () => {
      const res = await menusApi.get(weekStart)
      return res.status === 200 ? res.data : null
    },
  })

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
    queryClient.invalidateQueries({ queryKey: ['menus', 'week', weekStart] })
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
    mutationFn: () => menusApi.create({ week_start: weekStart, ...normalizeContent(content) }),
    onSuccess: () => { toast.success('Menu créé.'); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const updateMutation = useMutation({
    mutationFn: () => menusApi.update(weekStart, normalizeContent(content)),
    onSuccess: () => { toast.success('Menu enregistré.'); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => menusApi.remove(weekStart),
    onSuccess: () => { toast.success('Menu supprimé.'); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const setCell = (day: Weekday, slot: MealSlot, value: string) => {
    setContent((prev) => ({ ...prev, [day]: { ...prev[day], [slot]: value } }))
  }

  const isEditable = !isPast
  const isSaving = createMutation.isPending || updateMutation.isPending
  const showEmptyPastState = !menu && isPast && !isLoading

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Semaine du {formatDate(weekStart)} <br />Au {formatDate(weekEnd)}</h2>
        
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => onWeekStartChange(toIsoDate(addDays(parseIsoDate(weekStart), -7)))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onWeekStartChange(currentMonday)}>
            Aujourd&apos;hui
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => onWeekStartChange(toIsoDate(addDays(parseIsoDate(weekStart), 7)))}>
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
          ) : showEmptyPastState ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Aucun menu enregistré pour cette semaine.</p>
          ) : (
            <>
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-40">Repas</TableHead>
                      {WEEKDAYS.map((day) => {
                        const isToday = dayDates[day] === today
                        return (
                          <TableHead key={day} className={cn('text-center', isToday && 'text-primary')}>
                            <div>{WEEKDAY_LABELS[day]}</div>
                            <div className="text-xs font-normal text-muted-foreground">{formatShortDate(dayDates[day])}</div>
                            {isToday && <Badge variant="default" className="mt-1">Aujourd&apos;hui</Badge>}
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
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Icon className="size-4" />
                              <span className="text-foreground">{MEAL_SLOT_LABELS[slot]}</span>
                            </div>
                          </TableCell>
                          {WEEKDAYS.map((day) => (
                            <TableCell key={day} className="whitespace-normal">
                              <Input
                                value={content[day][slot] ?? ''}
                                onChange={(e) => setCell(day, slot, e.target.value)}
                                disabled={!isEditable}
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
                        <h3 className="font-medium">{WEEKDAY_LABELS[day]}</h3>
                        <span className="text-sm text-muted-foreground">{formatShortDate(dayDates[day])}</span>
                        {isToday && <Badge variant="default">Aujourd&apos;hui</Badge>}
                      </div>
                      <div className="space-y-2">
                        {MEAL_SLOTS.map((slot) => {
                          const Icon = MEAL_SLOT_ICONS[slot]
                          return (
                            <div key={slot}>
                              <label className="mb-0.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                                <Icon className="size-4" />
                                {MEAL_SLOT_LABELS[slot]}
                              </label>
                              <Input
                                value={content[day][slot] ?? ''}
                                onChange={(e) => setCell(day, slot, e.target.value)}
                                disabled={!isEditable}
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

      {isEditable && !showEmptyPastState && !isLoading && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => (menu ? updateMutation.mutate() : createMutation.mutate())}
            disabled={isSaving || isFetching}
          >
            {isSaving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            {menu ? 'Enregistrer' : 'Créer cette semaine'}
          </Button>
          {menu && (
            <AlertDialog>
              <AlertDialogTrigger render={<Button type="button" variant="destructive" />}>
                Supprimer
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer ce menu ?</AlertDialogTitle>
                  <AlertDialogDescription>Cette action est définitive.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMutation.mutate()}>Supprimer</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      {isPast && !showEmptyPastState && (
        <p className="text-sm text-muted-foreground">Semaine passée — lecture seule.</p>
      )}
    </div>
  )
}
