'use client'

import { useTranslations } from 'next-intl'

import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Bell, Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { libraryApi } from '@/lib/api/library.api'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { getApiErrorMessage } from '@/lib/utils/api-error'

// Le second paramètre porte les valeurs d'interpolation (`{min}`, `{max}`) :
// les bornes vivent dans le schéma, leur formulation dans le catalogue.
type T = (key: string, values?: Record<string, string | number>) => string

const makeformSchema = (t: T) => z.object({
  reminders_enabled: z.boolean(),
  reminder_days_before: z
    .number({ error: t('settings.number') })
    .int(t('validation.integer'))
    .min(0, t('validation.minDays', { min: 0 }))
    .max(90, t('validation.maxDays', { max: 90 })),
  default_loan_days: z
    .number({ error: t('settings.number') })
    .int(t('validation.integer'))
    .min(1, t('validation.minDays', { min: 1 }))
    .max(365, t('validation.maxDays', { max: 365 })),
})

type FormValues = z.infer<ReturnType<typeof makeformSchema>>

export function SettingsTab() {
  const t = useTranslations('library')
  const queryClient = useQueryClient()
  const user = useUser()
  const isAdmin = user?.role === 'admin'
  const { permissions } = useMyPermissions()
  const canLend = isAdmin || permissions.has('library:lend')

  const { data: settings } = useQuery({
    queryKey: ['library-settings'],
    queryFn: () => libraryApi.getSettings().then((r) => r.data),
  })

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(makeformSchema(t)),
    defaultValues: { reminders_enabled: false, reminder_days_before: 3, default_loan_days: 14 },
  })

  useEffect(() => {
    if (settings) {
      reset({
        reminders_enabled: settings.reminders_enabled,
        reminder_days_before: settings.reminder_days_before,
        default_loan_days: settings.default_loan_days,
      })
    }
  }, [settings, reset])

  const remindersEnabled = watch('reminders_enabled')

  const saveMutation = useMutation({
    mutationFn: (values: FormValues) => libraryApi.updateSettings(values),
    onSuccess: () => {
      toast.success(t('settings.saved'))
      queryClient.invalidateQueries({ queryKey: ['library-settings'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  const remindersMutation = useMutation({
    mutationFn: () => libraryApi.runReminders(),
    onSuccess: (res) => {
      const { reminded_parents, reminded_lendings } = res.data
      if (reminded_lendings === 0) {
        toast.success(t('settings.nothingToRemind'))
      } else {
        toast.success(t('settings.reminded', { parents: reminded_parents, lendings: reminded_lendings }))
      }
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  return (
    <div className="space-y-4 pt-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="size-4" />
            {t('settings.remindersTitle')}
          </CardTitle>
          <CardDescription>
            {t('settings.remindersHint')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((values) => saveMutation.mutate(values))} className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <label htmlFor="reminders-enabled" className="text-sm font-medium">{t('remindersEnable')}</label>
                <p className="text-sm text-muted-foreground">{t('remindersHint')}</p>
              </div>
              <Switch
                id="reminders-enabled"
                checked={remindersEnabled}
                onCheckedChange={(v) => setValue('reminders_enabled', v)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="reminder-days-before">{t('settings.daysBefore')}</Label>
                <Input
                  id="reminder-days-before"
                  type="number"
                  min={0}
                  max={90}
                  disabled={!remindersEnabled}
                  {...register('reminder_days_before', { valueAsNumber: true })}
                />
                {errors.reminder_days_before && (
                  <p className="text-xs text-destructive">{errors.reminder_days_before.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="default-loan-days">{t('settings.defaultLoanDays')}</Label>
                <Input id="default-loan-days" type="number" min={1} max={365} {...register('default_loan_days', { valueAsNumber: true })} />
                {errors.default_loan_days && (
                  <p className="text-xs text-destructive">{errors.default_loan_days.message}</p>
                )}
              </div>
            </div>

{isAdmin && (
            <Button type="submit" disabled={isSubmitting || !settings}>
              {isSubmitting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {t('settings.save')}
            </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="size-4" />
            {t('settings.manualTitle')}
          </CardTitle>
          <CardDescription>
            {t('settings.manualHint')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canLend && (
          <Button variant="outline" disabled={remindersMutation.isPending} onClick={() => remindersMutation.mutate()}>
            {remindersMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {t('settings.sendNow')}
          </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}