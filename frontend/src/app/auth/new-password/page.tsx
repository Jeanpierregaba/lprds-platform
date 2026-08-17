'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
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

const pwdSchema = z.object({
    new_password: z.string()
      .min(8, '8 caractères minimum')
      .regex(/[A-Z]/, 'Une majuscule requise')
      .regex(/[0-9]/, 'Un chiffre requis'),
    confirm: z.string(),
  }).refine((d) => d.new_password === d.confirm, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirm'],
})

type Form = z.infer<typeof pwdSchema>

export default function NewPasswordPage() {
    return (
        <Suspense fallback={null}>
            <NewPasswordForm />
        </Suspense>
    )
}

function NewPasswordForm() {
    const router       = useRouter()
    const searchParams = useSearchParams()
    const token        = searchParams.get('token')

    const { register, handleSubmit, formState: { errors, isSubmitting } } =
      useForm<Form>({ resolver: zodResolver(pwdSchema) })

    const onSubmit = async ({ new_password }: Form) => {
      if (!token) {
        toast.error('Lien invalide ou expiré')
        return
      }
      try {
        await authApi.confirmReset({ token, new_password })
        toast.success('Mot de passe mis à jour. Connectez-vous.')
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
                    <CardTitle>Nouveau mot de passe</CardTitle>
                    <CardDescription>Entrez votre nouveau mot de passe.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Nouveau mot de passe</Label>
                            <Input type="password" {...register('new_password')} autoFocus />
                            {errors.new_password && (
                            <p className="text-sm text-destructive">{errors.new_password.message}</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label>Confirmer le mot de passe</Label>
                            <Input type="password" {...register('confirm')} />
                            {errors.confirm && (
                            <p className="text-sm text-destructive">{errors.confirm.message}</p>
                            )}
                                        </div>
                        <p className="text-xs text-muted-foreground">
                            8 caractères minimum · 1 majuscule · 1 chiffre
                        </p>
                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting
                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Enregistrement...</>
                            : 'Enregistrer'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </motion.div>
    </div>
  )
}
