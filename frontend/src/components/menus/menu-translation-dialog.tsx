'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Languages, Loader2, UserPen } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useLabel } from '@/lib/i18n/labels'
import { menusApi } from '@/lib/api/menus.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import {
  MEAL_SLOTS, WEEKDAYS, emptyWeek,
  type MealSlot, type Weekday, type WeekContent,
} from '@/types/menus'

/**
 * Relecture de la traduction anglaise d'une semaine de menus.
 *
 * Pourquoi un écran à part, et pas un simple onglet « English » dans la grille
 * de saisie : la traduction se relit EN REGARD du français. Un onglet
 * masquerait la source au moment précis où le relecteur en a besoin.
 *
 * Deux choses à savoir pour comprendre le comportement :
 *
 * - l'anglais affiché est celui qui est STOCKÉ, jamais le repli français servi
 *   aux lecteurs. Un champ vide signale donc un vrai trou de traduction, ce
 *   qui est l'information la plus utile de cet écran ;
 * - enregistrer répercute chaque plat relu dans la mémoire de traduction
 *   côté backend. La correction vaut donc pour les semaines suivantes, pas
 *   seulement pour celle-ci — c'est tout l'intérêt, les plats reviennent.
 */
export function MenuTranslationDialog({
  weekStart, departmentId,
}: {
  weekStart: string
  departmentId: string
}) {
  const t = useTranslations('menus')
  const tCommon = useTranslations('common')
  const mealSlotsLabel = useLabel('mealSlots')
  const weekdaysLabel = useLabel('weekdays')
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)
  const [english, setEnglish] = useState<WeekContent>(emptyWeek())

  const { data, isLoading } = useQuery({
    queryKey: ['menus', 'translation', weekStart, departmentId],
    queryFn: () => menusApi.getTranslation(weekStart, departmentId).then((r) => r.data),
    // Rien à charger tant que le dialogue est fermé : c'est un écran
    // d'exception, pas une donnée de la page.
    enabled: open,
  })

  useEffect(() => {
    if (data) setEnglish(data.english)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () => menusApi.setTranslation(weekStart, departmentId, english),
    onSuccess: () => {
      toast.success(t('translation.saved'))
      queryClient.invalidateQueries({ queryKey: ['menus', 'translation', weekStart, departmentId] })
      queryClient.invalidateQueries({ queryKey: ['menus', 'week', weekStart, departmentId] })
      setOpen(false)
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const setCell = (day: Weekday, slot: MealSlot, value: string) => {
    setEnglish((prev) => ({ ...prev, [day]: { ...prev[day], [slot]: value || null } }))
  }

  const isManual = (day: Weekday, slot: MealSlot) =>
    data?.manual_slots.includes(`${day}.${slot}`) ?? false

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        <Languages className="mr-1.5 size-4" />
        {t('translation.review')}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('translation.title')}</DialogTitle>
          <DialogDescription>{t('translation.hint')}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : (
          <div className="space-y-5">
            {WEEKDAYS.map((day) => {
              // Un jour entièrement vide côté français n'a rien à relire :
              // l'afficher noierait les jours qui comptent.
              const filled = MEAL_SLOTS.filter((slot) => data?.french[day]?.[slot])
              if (filled.length === 0) return null
              return (
                <div key={day} className="space-y-2">
                  <h3 className="text-sm font-semibold">{weekdaysLabel(day)}</h3>
                  {filled.map((slot) => (
                    <div key={slot} className="grid gap-2 sm:grid-cols-2 sm:items-center">
                      <div className="min-w-0">
                        <span className="text-xs text-muted-foreground">{mealSlotsLabel(slot)}</span>
                        <p className="truncate text-sm">{data?.french[day]?.[slot]}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={english[day]?.[slot] ?? ''}
                          onChange={(e) => setCell(day, slot, e.target.value)}
                          placeholder={t('translation.placeholder')}
                        />
                        {isManual(day, slot) && (
                          <Badge variant="secondary" className="shrink-0 gap-1">
                            <UserPen className="size-3" />
                            {t('translation.corrected')}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || isLoading}
          >
            {saveMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            {tCommon('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
