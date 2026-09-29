'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
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
import { parentsApi } from '@/lib/api/parents.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { BackLink, PageMotion, RightsGuard } from '@/components/dashboard/shared/page'
import { ChildMultiSelect } from '../child-multiselect'
import type { ParentChildBrief } from '@/types/parents'
import { useRouter } from '@/i18n/navigation'

type T = (key: string) => string

const makeSchema = (t: T) => z.object({
  first_name: z.string().min(1, t('validation.firstName')).max(100),
  last_name:  z.string().min(1, t('validation.lastName')).max(100),
  nickname:   z.string().min(1, t('validation.nickname')).max(100),
  phone:      z.string().min(1, t('validation.phone')).max(20),
  email:      z.string().email(t('validation.email')),
  password:   z.string()
    .min(8, t('validation.passwordMin'))
    .regex(/[A-Z]/, 'Une majuscule requise')
    .regex(/[0-9]/, 'Un chiffre requis'),
})
type Form = z.infer<ReturnType<typeof makeSchema>>

export default function NewParentPage() {
  const t = useTranslations('parents')
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('parents:write')
  const router = useRouter()
  const [children, setChildren] = useState<ParentChildBrief[]>([])
  const [childrenError, setChildrenError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<Form>({ resolver: zodResolver(makeSchema(t)) })

  const onSubmit = async (values: Form) => {
    if (children.length === 0) {
      setChildrenError('Au moins un enfant doit être assigné.')
      return
    }
    setChildrenError(null)
    try {
      const { data } = await parentsApi.create({
        first_name: values.first_name,
        last_name:  values.last_name,
        nickname:   values.nickname,
        phone:      values.phone,
        email:      values.email,
        password:   values.password,
        child_ids:  children.map((c) => c.id),
      })
      toast.success(t('form.created'))
      router.push(`/dashboard/admin/parents/${data.id}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  if (!canWrite) {
    return (
      <RightsGuard
        message={t('form.noRights')}
        backHref="/dashboard/admin/parents"
      />
    )
  }

  return (
    <PageMotion className="mx-auto w-full max-w-2xl space-y-4">
      <BackLink href="/dashboard/admin/parents" label={t('form.back')} />

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
              <Label>{t('fields.assignedChildren')}</Label>
              <ChildMultiSelect selected={children} onChange={(c) => { setChildren(c); if (c.length > 0) setChildrenError(null) }} />
              {childrenError && <p className="text-sm text-destructive">{childrenError}</p>}
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
