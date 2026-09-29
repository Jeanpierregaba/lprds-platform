'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { authApi } from '@/lib/api/auth.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { Link } from '@/i18n/navigation'

const makeSchema = (t: (k: string) => string) =>
  z.object({ email: z.string().email(t('validation.email')) })
type Form = z.infer<ReturnType<typeof makeSchema>>

export default function ResetPasswordPage() {
    const t = useTranslations('auth')
    const schema = makeSchema(t)
    const [sent, setSent] = useState(false)
    const { register, handleSubmit, formState: { errors, isSubmitting } } =
      useForm<Form>({ resolver: zodResolver(schema) })
  
    const onSubmit = async ({ email }: Form) => {
      try {
        await authApi.requestReset({ email })
        setSent(true)
      } catch (err) {
        toast.error(getApiErrorMessage(err))
      }
    }

return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="w-full max-w-md"
        >
            <Card>
                <CardHeader className="pb-4">
                <CardTitle>{t('reset.title')}</CardTitle>
                <CardDescription>
                    {t('reset.subtitle')}
                </CardDescription>
                </CardHeader>
                <CardContent>
                {sent ? (
                    <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-3 py-6 text-center"
                    >
                    <CheckCircle2 className="text-green-500" size={48} strokeWidth={1.5} />
                    <p className="font-medium">{t('reset.sentTitle')}</p>
                    <p className="text-sm text-muted-foreground">
                        {t('reset.sentBody')}
                    </p>

                    <Link href="/auth/login" className="text-sm text-primary hover:underline mt-2">
                    {t('reset.backToLogin')}
                    </Link>
                </motion.div>
                ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">{t('fields.email')}</Label>
                        <Input id="email" type="email" {...register('email')} autoFocus />
                        {errors.email && (
                            <p className="text-sm text-destructive">{errors.email.message}</p>
                        )}
                    </div>
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting
                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('reset.submitting')}</>
                        : t('reset.submit')}
                    </Button>
                    <div className="text-center">
                        <Link href="/auth/login" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                            {t('reset.backToLogin')}
                        </Link>
                    </div>
                </form>
                )}
                </CardContent>
            </Card>
        </motion.div>
    </div>
  )
}