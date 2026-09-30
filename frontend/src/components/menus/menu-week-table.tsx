'use client'

import { useTranslations } from 'next-intl'

import { Coffee, Cookie, IceCream2, Utensils } from 'lucide-react'
import { useLabel } from '@/lib/i18n/labels'

import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  MEAL_SLOTS, WEEKDAYS, type MealSlot, type Menu, type Weekday,
} from '@/types/menus'

const MEAL_SLOT_ICONS: Record<MealSlot, React.ElementType> = {
  collation: Coffee,
  dejeuner: Utensils,
  dessert: IceCream2,
  gouter: Cookie,
}

/** Tableau lecture seule d'une semaine de menus (desktop + mobile). */
export function MenuWeekTable({
  menu, dayDates, today, formatShortDate,
}: {
  menu: Menu
  dayDates: Record<Weekday, string>
  today: string
  formatShortDate: (iso: string) => string
}) {
  const t = useTranslations('menus')
  const mealSlotsLabel = useLabel('mealSlots')
  const weekdaysLabel = useLabel('weekdays')
  return (
    <>
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">{t('week.mealColumn')}</TableHead>
              {WEEKDAYS.map((day) => {
                const isToday = dayDates[day] === today
                return (
                  <TableHead key={day} className={cn('text-center', isToday && 'text-primary')}>
                    <div>{weekdaysLabel(day)}</div>
                    <div className="text-xs font-normal text-muted-foreground">{formatShortDate(dayDates[day])}</div>
                    {isToday && <Badge variant="default" className="mt-1">{t('week.today')}</Badge>}
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
                      <span className="text-foreground">{mealSlotsLabel(slot)}</span>
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
                <span className="font-medium text-foreground">{mealSlotsLabel(slot)}</span>
              </div>
              <div className="mt-2 space-y-2">
                {WEEKDAYS.map((day) => {
                  const isToday = dayDates[day] === today
                  return (
                    <div key={day} className={cn('flex items-start justify-between gap-3 text-sm', isToday && 'text-primary')}>
                      <span className="shrink-0">{weekdaysLabel(day)}</span>
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
  )
}
