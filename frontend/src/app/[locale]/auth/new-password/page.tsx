'use client'

import { useTranslations } from 'next-intl'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { authApi } from '@/lib/api/auth.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { useRouter } from '@/i18n/navigation'

const makePwdSchema = (t: (k: string) => string) =>
  z.object({
    new_password: z.string()
      .min(8, t('validation.passwordMin'))
      .regex(/[A-Z]/, t('validation.passwordUpper'))
      .regex(/[0-9]/, t('validation.passwordDigit')),
    confirm: z.string(),
  }).refine((d) => d.new_password === d.confirm, {
    message: t('validation.passwordMismatch'),
    path: ['confirm'],
})

type Form = z.infer<ReturnType<typeof makePwdSchema>>

export default function NewPasswordPage() {
    return (
        <Suspense fallback={null}>
            <NewPasswordForm />
        </Suspense>
    )
}

function NewPasswordForm() {
    const t = useTranslations('auth')
    const pwdSchema = makePwdSchema(t)
    const router       = useRouter()
    const searchParams = useSearchParams()
    const token        = searchParams.get('token')

    const { register, handleSubmit, formState: { errors, isSubmitting } } =
      useForm<Form>({ resolver: zodResolver(pwdSchema) })

    const onSubmit = async ({ new_password }: Form) => {
      if (!token) {
        toast.error(t('newPassword.invalidLink'))
        return
      }
      try {
        await authApi.confirmReset({ token, new_password })
        toast.success(t('newPassword.success'))
        router.push('/auth/login')
      } catch (err) {
        toast.error(getApiErrorMessage(err))
      }
    }

return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }}
            transition={{ duration:0.4, ease:'easeOut' }} className="w-full max-w-md">
            <Card>
                <CardHeader className="pb-4">
                    <CardTitle>{t('newPassword.title')}</CardTitle>
                    <CardDescription>{t('newPassword.subtitle')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="space-y-2">
                            <Label>{t('fields.newPassword')}</Label>
                            <Input type="password" {...register('new_password')} autoFocus />
                            {errors.new_password && (
                            <p className="text-sm text-destructive">{errors.new_password.message}</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label>{t('fields.confirmPassword')}</Label>
                            <Input type="password" {...register('confirm')} />
                            {errors.confirm && (
                            <p className="text-sm text-destructive">{errors.confirm.message}</p>
                            )}
                                        </div>
                        <p className="text-xs text-muted-foreground">
                            {t('newPassword.hint')}
                        </p>
                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting
                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> {t('newPassword.submitting')}</>
                            : t('newPassword.submit')}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </motion.div>
    </div>
  )
}
