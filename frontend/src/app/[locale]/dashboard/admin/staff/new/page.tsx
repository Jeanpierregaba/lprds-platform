'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { useLabelMap } from '@/lib/i18n/labels'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { staffApi } from '@/lib/api/staff.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { BackLink, PageMotion, RightsGuard } from '@/components/dashboard/shared/page'
import { STAFF_TYPES, type StaffType } from '@/types/staff'
import { useRouter } from '@/i18n/navigation'

type T = (key: string) => string

const makeSchema = (t: T) => z.object({
  first_name: z.string().min(1, t('validation.firstName')).max(100),
  last_name:  z.string().min(1, t('validation.lastName')).max(100),
  nickname:   z.string().min(1, t('validation.nickname')).max(100),
  phone:      z.string().min(1, t('validation.phone')).max(20),
  email:      z.string().email(t('validation.email')),
  staff_type: z.string().min(1, t('validation.staffType')),
  password:   z.string()
    .min(8, t('validation.passwordMin'))
    .regex(/[A-Z]/, t('validation.passwordUpper'))
    .regex(/[0-9]/, t('validation.passwordDigit')),
})
type Form = z.infer<ReturnType<typeof makeSchema>>

export default function NewStaffPage() {
  const t = useTranslations('staff')
  const staffTypesLabels = useLabelMap('staffTypes', STAFF_TYPES)
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('staff:write')
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)

  const { register, handleSubmit, control, formState: { errors, isSubmitting } } =
    useForm<Form>({ resolver: zodResolver(makeSchema(t)), defaultValues: { staff_type: '' } })

  const onSubmit = async (values: Form) => {
    try {
      const { data } = await staffApi.create({
        first_name: values.first_name,
        last_name:  values.last_name,
        nickname:   values.nickname,
        phone:      values.phone,
        email:      values.email,
        password:   values.password,
        staff_type: values.staff_type as StaffType,
      })
      toast.success(t('form.created'))
      router.push(`/dashboard/admin/staff/${data.id}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  if (!canWrite) {
    return (
      <RightsGuard
        message={t('form.noRights')}
        backHref="/dashboard/admin/staff"
      />
    )
  }

  return (
    <PageMotion className="mx-auto w-full max-w-2xl space-y-4">
      <BackLink href="/dashboard/admin/staff" label={t('form.back')} />

      <Card>
        <CardHeader>
          <CardTitle>{t('form.newTitle')}</CardTitle>
          <CardDescription>
            {t('form.newHint')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="first_name">{t('fields.firstName')}</Label>
                <Input id="first_name" {...register('first_name')} aria-invalid={!!errors.first_name} />
                {errors.first_name && <p className="text-sm text-destructive">{errors.first_name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">{t('fields.lastName')}</Label>
                <Input id="last_name" {...register('last_name')} aria-invalid={!!errors.last_name} />
                {errors.last_name && <p className="text-sm text-destructive">{errors.last_name.message}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nickname">{t('fields.nickname')}</Label>
              <Input id="nickname" placeholder={t('fields.nicknamePlaceholder')} {...register('nickname')} aria-invalid={!!errors.nickname} />
              {errors.nickname && <p className="text-sm text-destructive">{errors.nickname.message}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">{t('fields.email')}</Label>
                <Input id="email" type="email" {...register('email')} aria-invalid={!!errors.email} />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{t('fields.phone')}</Label>
                <Input id="phone" {...register('phone')} aria-invalid={!!errors.phone} />
                {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff_type">{t('fields.staffType')}</Label>
              <Controller
                control={control}
                name="staff_type"
                render={({ field }) => (
                  <Select items={staffTypesLabels} value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="staff_type" className="w-full" aria-invalid={!!errors.staff_type}>
                      <SelectValue placeholder={t('fields.chooseType')} />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(staffTypesLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.staff_type && <p className="text-sm text-destructive">{errors.staff_type.message}</p>}
              <p className="text-xs text-muted-foreground">
                Poste purement descriptif — n&apos;attribue aucun droit. Les droits se gèrent depuis
                Rôles &amp; permissions.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('fields.tempPassword')}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  {...register('password')}
                  aria-invalid={!!errors.password}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('fields.hidePassword') : t('fields.showPassword')}
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
              <p className="text-xs text-muted-foreground">
                {t('form.passwordHint')}
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting
                ? <><Loader2 className="mr-2 size-4 animate-spin" /> {t('form.submitting')}</>
                : t('form.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </PageMotion>
  )
}
