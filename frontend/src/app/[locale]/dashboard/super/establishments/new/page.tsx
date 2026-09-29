'use client'

import { useTranslations } from 'next-intl'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowLeft, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { establishmentsApi } from '@/lib/api/establishments.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { Link, useRouter } from '@/i18n/navigation'

type T = (key: string) => string

const makeSchema = (t: T) => z.object({
  code:    z.string().min(2, t('establishments.validation.codeMin')).max(10, t('establishments.validation.codeMax'))
    .regex(/^[A-Za-z0-9]+$/, t('establishments.validation.alphanumeric')),
  name:    z.string().min(1, t('establishments.validation.name')).max(200),
  address: z.string().min(1, t('establishments.validation.address')).max(500),
  email:   z.string().email(t('establishments.validation.email')),
  phone:   z.string().min(1, t('establishments.validation.phone')).max(20),

  admin_first_name: z.string().min(1, t('establishments.validation.firstName')).max(100),
  admin_last_name:  z.string().min(1, t('establishments.validation.name')).max(100),
  admin_email:      z.string().email(t('establishments.validation.email')),
  admin_phone:      z.string().max(20).optional().or(z.literal('')),
  admin_password:   z.string()
    .min(8, t('establishments.validation.passwordMin'))
    .regex(/[A-Z]/, 'Une majuscule requise')
    .regex(/[0-9]/, 'Un chiffre requis'),
})

type Form = z.infer<ReturnType<typeof makeSchema>>

export default function NewEstablishmentPage() {
  const t = useTranslations('admin')
  const router = useRouter()

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<Form>({ resolver: zodResolver(makeSchema(t)) })

  const onSubmit = async (values: Form) => {
    try {
      const { data } = await establishmentsApi.create({
        code:    values.code.toUpperCase(),
        name:    values.name,
        address: values.address,
        email:   values.email,
        phone:   values.phone,
        admin: {
          first_name: values.admin_first_name,
          last_name:  values.admin_last_name,
          email:      values.admin_email,
          phone:      values.admin_phone || undefined,
          password:   values.admin_password,
        },
      })
      toast.success(t('establishments.created'))
      router.push(`/dashboard/super/establishments/${data.id}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="mx-auto w-full max-w-2xl space-y-4"
    >
      <Link
        href="/dashboard/super/establishments"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('establishments.back')}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>{t('establishments.newTitle')}</CardTitle>
          <CardDescription>
            {t('establishments.newHint')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Établissement</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="code">{t('establishments.code')}</Label>
                  <Input id="code" placeholder="LPRDS" {...register('code')} aria-invalid={!!errors.code} />
                  {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">{t('establishments.name')}</Label>
                  <Input id="name" {...register('name')} aria-invalid={!!errors.name} />
                  {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">{t('establishments.address')}</Label>
                <Input id="address" {...register('address')} aria-invalid={!!errors.address} />
                {errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('establishments.email')}</Label>
                  <Input id="email" type="email" {...register('email')} aria-invalid={!!errors.email} />
                  {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">{t('establishments.phone')}</Label>
                  <Input id="phone" {...register('phone')} aria-invalid={!!errors.phone} />
                  {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Premier administrateur</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="admin_first_name">{t('establishments.firstName')}</Label>
                  <Input id="admin_first_name" {...register('admin_first_name')} aria-invalid={!!errors.admin_first_name} />
                  {errors.admin_first_name && <p className="text-sm text-destructive">{errors.admin_first_name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin_last_name">{t('establishments.lastName')}</Label>
                  <Input id="admin_last_name" {...register('admin_last_name')} aria-invalid={!!errors.admin_last_name} />
                  {errors.admin_last_name && <p className="text-sm text-destructive">{errors.admin_last_name.message}</p>}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="admin_email">{t('establishments.email')}</Label>
                  <Input id="admin_email" type="email" {...register('admin_email')} aria-invalid={!!errors.admin_email} />
                  {errors.admin_email && <p className="text-sm text-destructive">{errors.admin_email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin_phone">{t('establishments.phoneOptional')}</Label>
                  <Input id="admin_phone" {...register('admin_phone')} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin_password">{t('establishments.tempPassword')}</Label>
                <Input id="admin_password" type="password" {...register('admin_password')} aria-invalid={!!errors.admin_password} />
                {errors.admin_password && <p className="text-sm text-destructive">{errors.admin_password.message}</p>}
                <p className="text-xs text-muted-foreground">
                  8 caractères minimum · 1 majuscule · 1 chiffre — à transmettre à l&apos;admin hors plateforme
                  (aucun email n&apos;est envoyé pour ce mot de passe).
                </p>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting
                ? <><Loader2 className="mr-2 size-4 animate-spin" /> Création...</>
                : t('establishments.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  )
}
