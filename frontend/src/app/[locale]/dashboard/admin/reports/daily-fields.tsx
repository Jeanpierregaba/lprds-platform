'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { Controller, type UseFormReturn } from 'react-hook-form'
import { Plus, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckboxGroup } from './checkbox-group'
import type { DailyContentForm } from '@/lib/reports/content-schemas'
import type { ReportVocabulary } from '@/types/reports'

/** Saisie des activités une par une : texte + validation + bouton « + ». */
function ActivitiesEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const t = useTranslations('reports')
  const [draft, setDraft] = useState('')

  const add = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    onChange([...value, trimmed])
    setDraft('')
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={t('fields.activityPlaceholder')}
          aria-label={t('fields.newActivity')}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={add}
          disabled={!draft.trim()}
          aria-label={t('fields.addActivity')}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((activity, i) => (
            <Badge key={`${activity}-${i}`} variant="secondary" className="max-w-full gap-1 whitespace-normal break-words py-1 text-left font-normal">
              {i + 1}-{activity}
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                aria-label={t('fields.removeActivity', { name: activity })}
                className="shrink-0 rounded-full p-2 transition hover:bg-destructive/20"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

export function DailyFields({
  form, vocabulary,
}: { form: UseFormReturn<DailyContentForm>; vocabulary: ReportVocabulary }) {
  const t = useTranslations('reports')
  const { register, control, watch, formState: { errors } } = form
  const nap = watch('nap')

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="arrival_time">{t('fields.arrivalTime')}</Label>
          <Input id="arrival_time" type="time" {...register('arrival_time')} />
          <p className="text-xs text-muted-foreground">Pré-remplie depuis les présences si laissée vide.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="departure_time">{t('fields.departureTime')}</Label>
          <Input id="departure_time" type="time" {...register('departure_time')} />
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="health_status">{t('fields.healthStatus')}</Label>
        <Controller
          control={control}
          name="health_status"
          render={({ field }) => (
            <Select items={vocabulary.health_status} value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="health_status" className="w-full" aria-invalid={!!errors.health_status}>
                <SelectValue placeholder={t('fields.choose')} />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(vocabulary.health_status).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.health_status && <p className="text-sm text-destructive">{errors.health_status.message}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="temperature_arrival">{t('fields.tempArrival')}</Label>
          <Input id="temperature_arrival" type="number" step="0.1" {...register('temperature_arrival')} aria-invalid={!!errors.temperature_arrival} />
          {errors.temperature_arrival && <p className="text-sm text-destructive">{errors.temperature_arrival.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="temperature_departure">{t('fields.tempDeparture')}</Label>
          <Input id="temperature_departure" type="number" step="0.1" {...register('temperature_departure')} aria-invalid={!!errors.temperature_departure} />
          {errors.temperature_departure && <p className="text-sm text-destructive">{errors.temperature_departure.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="health_notes">{t('fields.healthNotes')}</Label>
        <Textarea id="health_notes" rows={2} {...register('health_notes')} />
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-3">
        {(['breakfast', 'lunch', 'snack'] as const).map((meal) => (
          <div key={meal} className="space-y-2">
            <Label htmlFor={meal}>
              {meal === 'breakfast' ? t('fields.breakfast') : meal === 'lunch' ? t('fields.lunch') : t('fields.snack')}
            </Label>
            <Controller
              control={control}
              name={meal}
              render={({ field }) => (
                <Select items={vocabulary.meal_amount} value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id={meal} className="w-full" aria-invalid={!!errors[meal]}>
                    <SelectValue placeholder={t('fields.choose')} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(vocabulary.meal_amount).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors[meal] && <p className="text-sm text-destructive">{errors[meal]?.message}</p>}
          </div>
        ))}
      </div>

      <Separator />

      <div className="flex flex-wrap gap-6">
        <div className="flex items-center gap-2">
          <Controller control={control} name="nap" render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} id="nap" />
          )} />
          <Label htmlFor="nap">{t('fields.nap')}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Controller control={control} name="bath" render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} id="bath" />
          )} />
          <Label htmlFor="bath">{t('fields.bath')}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Controller control={control} name="poop" render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} id="poop" />
          )} />
          <Label htmlFor="poop">{t('fields.poop')}</Label>
        </div>
      </div>

      {nap && (
        <div className="max-w-xs space-y-2">
          <Label htmlFor="nap_duration_minutes">{t('fields.napDuration')}</Label>
          <Input id="nap_duration_minutes" type="number" {...register('nap_duration_minutes')} aria-invalid={!!errors.nap_duration_minutes} />
          {errors.nap_duration_minutes && <p className="text-sm text-destructive">{errors.nap_duration_minutes.message}</p>}
        </div>
      )}

      <Separator />

      <div className="space-y-2">
        <Label>{t('fields.moods')}</Label>
        <Controller
          control={control}
          name="moods"
          render={({ field }) => (
            <CheckboxGroup options={vocabulary.mood} value={field.value} onChange={field.onChange} />
          )}
        />
        {errors.moods && <p className="text-sm text-destructive">{errors.moods.message}</p>}
      </div>

      <div className="space-y-2">
        <Label>{t('fields.dayActivities')}</Label>
        <Controller
          control={control}
          name="activities"
          render={({ field }) => (
            <ActivitiesEditor value={field.value} onChange={field.onChange} />
          )}
        />
        {errors.activities && <p className="text-sm text-destructive">{errors.activities.message}</p>}
      </div>

      <div className="space-y-2">
        <Label>{t('fields.behaviors')}</Label>
        <Controller
          control={control}
          name="behaviors"
          render={({ field }) => (
            <CheckboxGroup options={vocabulary.behavior_tag} value={field.value} onChange={field.onChange} />
          )}
        />
        {errors.behaviors && <p className="text-sm text-destructive">{errors.behaviors.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="highlight">{t('fields.highlight')}</Label>
        <Textarea id="highlight" rows={2} {...register('highlight')} />
      </div>
    </div>
  )
}
