'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Coffee, Cookie, IceCream2, UtensilsCrossed, Utensils } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { menusApi } from '@/lib/api/menus.api'
import { addDays, mondayOf, parseIsoDate, toIsoDate } from '@/lib/utils/dates'
import { cn } from '@/lib/utils'
import {
  MEAL_SLOTS, MEAL_SLOT_LABELS, WEEKDAYS, WEEKDAY_LABELS,
  type MealSlot, type Weekday,
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

export default function ParentMenusPage() {
  const currentMonday = toIsoDate(mondayOf(new Date()))
  const [weekStart, setWeekStart] = useState(currentMonday)

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

  const { data: menu, isLoading } = useQuery({
    queryKey: ['parent', 'menus', weekStart],
    queryFn: async () => {
      const res = isCurrentWeek ? await menusApi.getCurrent() : await menusApi.get(weekStart)
      return res.status === 200 ? res.data : null
    },
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Menus</h1>
          <p className="text-muted-foreground">Repas servis par l&apos;établissement.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Semaine du {formatDate(weekStart)} <br />
            Au {formatDate(weekEnd)}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={isCurrentWeek}
            onClick={() => setWeekStart(toIsoDate(addDays(parseIsoDate(weekStart), -7)))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={isCurrentWeek} onClick={() => setWeekStart(currentMonday)}>
            Cette semaine
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => setWeekStart(toIsoDate(addDays(parseIsoDate(weekStart), 7)))}>
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
              <p className="font-medium text-foreground">Aucun menu publié pour cette semaine.</p>
            </div>
          ) : (
            <>
              <div className="hidden sm:block">
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
                            <TableCell key={day} className="text-center text-sm">
                              {menu[day][slot] ?? <span className="text-muted-foreground">—</span>}
                            </TableCell>
                          ))}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="divide-y divide-border sm:hidden">
                {MEAL_SLOTS.map((slot) => {
                  const Icon = MEAL_SLOT_ICONS[slot]
                  return (
                    <div key={slot} className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Icon className="size-4" />
                        <span className="font-medium text-foreground">{MEAL_SLOT_LABELS[slot]}</span>
                      </div>
                      <div className="mt-2 space-y-2">
                        {WEEKDAYS.map((day) => {
                          const isToday = dayDates[day] === today
                          return (
                            <div key={day} className={cn('flex items-start justify-between gap-3 text-sm', isToday && 'text-primary')}>
                              <span className="shrink-0">{WEEKDAY_LABELS[day]}</span>
                              <span className="text-right text-muted-foreground">
                                {menu[day][slot] ?? <span>—</span>}
                              </span>
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
    </motion.div>
  )
}
