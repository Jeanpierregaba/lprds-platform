'use client'

import { useForm } from 'react-hook-form'
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
import { ROLE_LABELS } from '@/types/auth'
import { getApiErrorMessage } from '@/lib/utils/api-error'

const schema = z.object({
  current_password: z.string().min(1, 'Mot de passe actuel requis'),
  new_password: z.string()
    .min(8, '8 caractères minimum')
    .regex(/[A-Z]/, 'Une majuscule requise')
    .regex(/[0-9]/, 'Un chiffre requis'),
  confirm: z.string(),
}).refine((d) => d.new_password === d.confirm, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirm'],
})

type Form = z.infer<typeof schema>

export function ProfileSettingsTab() {
  const user = useUser()

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = async ({ current_password, new_password }: Form) => {
    try {
      await authApi.changePassword({ current_password, new_password })
      toast.success('Mot de passe mis à jour.')
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
          <CardTitle className="text-base">Informations</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Nom complet</Label>
            <p className="text-sm font-medium">{user.first_name} {user.last_name}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <p className="text-sm font-medium">{user.email}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Rôle</Label>
            <div>
              <Badge variant="default">
                <ShieldCheck className="mr-1 size-3" />
                {ROLE_LABELS[user.role]}
              </Badge>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Téléphone</Label>
            <p className="text-sm font-medium">{user.phone ?? '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Changer de mot de passe</CardTitle>
          <CardDescription>Votre mot de passe actuel vous sera demandé pour confirmer.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="current_password">Mot de passe actuel</Label>
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
              <Label htmlFor="new_password">Nouveau mot de passe</Label>
              <Input
                id="new_password"
                type="password"
                {...register('new_password')}
                aria-invalid={!!errors.new_password}
              />
              {errors.new_password && <p className="text-sm text-destructive">{errors.new_password.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmer le nouveau mot de passe</Label>
              <Input
                id="confirm"
                type="password"
                {...register('confirm')}
                aria-invalid={!!errors.confirm}
              />
              {errors.confirm && <p className="text-sm text-destructive">{errors.confirm.message}</p>}
            </div>
            <p className="text-xs text-muted-foreground">
              8 caractères minimum · 1 majuscule · 1 chiffre
            </p>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? <><Loader2 className="mr-2 size-4 animate-spin" /> Enregistrement...</>
                  : 'Mettre à jour le mot de passe'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
