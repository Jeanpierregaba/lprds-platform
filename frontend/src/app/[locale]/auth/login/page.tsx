'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import Image from 'next/image'

import heroImg from '@/assets/hero-img.png'
import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Label }    from '@/components/ui/label'
import { Card, CardContent, CardDescription,
          CardHeader, CardTitle } from '@/components/ui/card'
import { authApi } from '@/lib/api/auth.api'
import { useAuthStore } from '@/lib/stores/auth.store'
import { ROLE_HOME } from '@/types/auth'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { Link, useRouter } from '@/i18n/navigation'

/** Le schéma est construit dans le composant : ses messages d'erreur sont
 *  traduits, donc il ne peut plus vivre au niveau module. */
const makeLoginSchema = (t: (k: string) => string) =>
  z.object({
    email:    z.string().email(t('validation.email')),
    password: z.string().min(1, t('validation.passwordRequired')),
  })
  type LoginForm = z.infer<ReturnType<typeof makeLoginSchema>>

  export default function LoginPage() {
    const t = useTranslations('auth')
    const loginSchema = makeLoginSchema(t)
    const router    = useRouter()
    const setSession = useAuthStore((s) => s.setSession)
    const [showPwd, setShowPwd] = useState(false)
  
    const { register, handleSubmit, formState: { errors, isSubmitting } } =
      useForm<LoginForm>({ resolver: zodResolver(loginSchema) })
  
        const onSubmit = async (values: LoginForm) => {
        try {
            const { data: tokens } = await authApi.login(values)
        
            // Appeler /me avec le token en header direct, sans passer par le store
            const { data: user } = await authApi.me(tokens.access_token)
        
            setSession(tokens, user)

            toast.success(t('login.welcome', { name: user.nickname || user.first_name }))
            router.push(ROLE_HOME[user.role])
        } catch (err) {
            toast.error(getApiErrorMessage(err))
        }
        }

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <Image
        src={heroImg}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div aria-hidden className="absolute inset-0 bg-neutral-900/70" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative w-full max-w-md"
      >
        <Card className="border shadow-sm">
          <CardHeader className="space-y-1 pb-6">
            <div className="flex justify-center mb-4">
              <Image
                src="/images/marketing/logo.png"
                alt={t('login.logoAlt')}
                width={148}
                height={90}
                className="h-16 w-auto"
              />
            </div>
            <CardTitle className="text-2xl text-center">{t('login.title')}</CardTitle>
            <CardDescription className="text-center">
              {t('login.subtitle')}
            </CardDescription>
          </CardHeader>

                    <CardContent>
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                        <div className="space-y-2">
                            <Label htmlFor="email">{t('fields.email')}</Label>
                            <Input
                            id="email"
                            type="email"
                            placeholder={t('fields.emailPlaceholder')}
                            autoComplete="email"
                            autoFocus
                            {...register('email')}
                            aria-invalid={!!errors.email}
                            />
                            {errors.email && (
                            <motion.p
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="text-sm text-destructive"
                            >{errors.email.message}</motion.p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                            <Label htmlFor="password">{t('fields.password')}</Label>
                            <Link
                                href="/auth/reset-password"
                                className="text-sm text-muted-foreground hover:text-primary transition-colors"
                            >
                                {t('login.forgot')}
                            </Link>
                            </div>
                            <div className="relative">
                            <Input
                                id="password"
                                type={showPwd ? 'text' : 'password'}
                                autoComplete="current-password"
                                {...register('password')}
                                aria-invalid={!!errors.password}
                                className="pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPwd((v) => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                aria-label={showPwd ? t('fields.hidePassword') : t('fields.showPassword')}
                            >
                                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>

                            </div>
                            {errors.password && (
                            <motion.p
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="text-sm text-destructive"
                            >{errors.password.message}</motion.p>
                            )}
                        </div>

<Button
                  type="submit"
                  className="mt-2 w-full rounded-full bg-primary text-primary-foreground shadow-[0_4px_0_var(--color-primary-layer)] hover:translate-y-1 hover:bg-primary hover:shadow-none disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_0_var(--color-primary-layer)]"
                  disabled={isSubmitting}
                >
                  {isSubmitting
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('login.submitting')}</>
                  : t('login.submit')}
                </Button>
                        </form>
                    </CardContent>
                </Card>
            </motion.div>
    </div>
  )
}