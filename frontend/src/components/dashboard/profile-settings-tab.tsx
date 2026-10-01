'use client'

import { useTranslations } from 'next-intl'

import { useForm } from 'react-hook-form'
import { useLabel } from '@/lib/i18n/labels'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { authApi } from '@/lib/api/auth.api'
import { useUser } from '@/lib/stores/auth.store'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { passwordConfirmation } from '@/lib/validation/password'

type T = (key: string) => string

const makeschema = (t: T, tAuth: T) => passwordConfirmation(tAuth).extend({
  current_password: z.string().min(1, t('settings.currentPasswordRequired')),
})

type Form = z.infer<ReturnType<typeof makeschema>>

export function ProfileSettingsTab() {
  const t = useTranslations('admin')
  const tc = useTranslations('common')
  const tAuth = useTranslations('auth')
  const rolesLabel = useLabel('roles')
  const user = useUser()

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<Form>({ resolver: zodResolver(makeschema(t, tAuth)) })

  const onSubmit = async ({ current_password, new_password }: Form) => {
    try {
      await authApi.changePassword({ current_password, new_password })
      toast.success(t('settings.updated'))
      reset()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  if (!user) return null

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tc('profile.infoTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{tc('fields.fullName')}</Label>
            <p className="text-sm font-medium">{user.first_name} {user.last_name}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{tc('fields.email')}</Label>
            <p className="break-all text-sm font-medium">{user.email}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{tc('fields.role')}</Label>
            <div>
              <Badge variant="default">
                <ShieldCheck className="mr-1 size-3" />
                {rolesLabel(user.role)}
              </Badge>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{tc('fields.phone')}</Label>
            <p className="text-sm font-medium">{user.phone ?? '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.passwordTitle')}</CardTitle>
          <CardDescription>{t('settings.passwordHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="current_password">{t('settings.currentPassword')}</Label>
              <Input
                id="current_password"
                type="password"
                {...register('current_password')}
                aria-invalid={!!errors.current_password}
              />
              {errors.current_password && (
                <p className="text-sm text-destructive">{errors.current_password.message}</p>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="new_password">{t('settings.newPassword')}</Label>
              <Input
                id="new_password"
                type="password"
                {...register('new_password')}
                aria-invalid={!!errors.new_password}
              />
              {errors.new_password && <p className="text-sm text-destructive">{errors.new_password.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">{t('settings.confirmPassword')}</Label>
              <Input
                id="confirm"
                type="password"
                {...register('confirm')}
                aria-invalid={!!errors.confirm}
              />
              {errors.confirm && <p className="text-sm text-destructive">{errors.confirm.message}</p>}
            </div>
            <p className="text-xs text-muted-foreground">{t('passwordRules')}</p>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? <><Loader2 className="mr-2 size-4 animate-spin" /> {tc('states.saving')}</>
                  : t('settings.submit')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
