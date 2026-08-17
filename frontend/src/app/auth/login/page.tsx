'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import Link from 'next/link'

import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Label }    from '@/components/ui/label'
import { Card, CardContent, CardDescription,
          CardHeader, CardTitle } from '@/components/ui/card'
import { authApi } from '@/lib/api/auth.api'
import { useAuthStore } from '@/lib/stores/auth.store'
import { ROLE_HOME } from '@/types/auth'
import { getApiErrorMessage } from '@/lib/utils/api-error'

const loginSchema = z.object({
    email:    z.string().email('Email invalide'),
    password: z.string().min(1, 'Mot de passe requis'),
  })
  type LoginForm = z.infer<typeof loginSchema>
  
  export default function LoginPage() {
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

            toast.success(`Bonjour ${user.first_name} !`)
            router.push(ROLE_HOME[user.role])
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
                <Card className="border shadow-sm">
                    <CardHeader className="space-y-1 pb-6">
                        <div className="flex justify-center mb-4">
                        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
                            <span className="text-primary-foreground text-xl font-semibold">L</span>
                        </div>
                        </div>
                        <CardTitle className="text-2xl text-center">Connexion</CardTitle>
                        <CardDescription className="text-center">
                        Accédez à votre espace LPRDS
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                        <div className="space-y-2">
                            <Label htmlFor="email">Adresse email</Label>
                            <Input
                            id="email"
                            type="email"
                            placeholder="vous@exemple.com"
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
                            <Label htmlFor="password">Mot de passe</Label>
                            <Link
                                href="/auth/reset-password"
                                className="text-sm text-muted-foreground hover:text-primary transition-colors"
                            >
                                Mot de passe oublié ?
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
                                aria-label={showPwd ? 'Masquer' : 'Afficher'}
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

                        <Button type="submit" className="w-full mt-2" disabled={isSubmitting}>
                            {isSubmitting
                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connexion...</>
                            : 'Se connecter'}
                        </Button>
                        </form>
                    </CardContent>
                </Card>
            </motion.div>
    </div>
  )
}