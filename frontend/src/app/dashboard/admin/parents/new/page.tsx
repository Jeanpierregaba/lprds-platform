'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { parentsApi } from '@/lib/api/parents.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { ChildMultiSelect } from '../child-multiselect'
import type { ParentChildBrief } from '@/types/parents'

const schema = z.object({
  first_name: z.string().min(1, 'Prénom requis').max(100),
  last_name:  z.string().min(1, 'Nom requis').max(100),
  nickname:   z.string().min(1, 'Surnom requis').max(100),
  phone:      z.string().min(1, 'Téléphone requis').max(20),
  email:      z.string().email('Email invalide'),
  password:   z.string()
    .min(8, '8 caractères minimum')
    .regex(/[A-Z]/, 'Une majuscule requise')
    .regex(/[0-9]/, 'Un chiffre requis'),
})
type Form = z.infer<typeof schema>

export default function NewParentPage() {
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('parents:write')
  const router = useRouter()
  const [children, setChildren] = useState<ParentChildBrief[]>([])
  const [childrenError, setChildrenError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<Form>({ resolver: zodResolver(schema) })

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
      toast.success('Compte parent créé.')
      router.push(`/dashboard/admin/parents/${data.id}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  if (!canWrite) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <p className="text-sm text-muted-foreground">
          Droits insuffisants — vous n'avez pas la permission de créer un compte parent.
        </p>
        <Link href="/dashboard/admin/parents" className="text-sm text-primary hover:underline">
          Retour à la liste
        </Link>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="mx-auto w-full max-w-2xl space-y-4"
    >
      <Link
        href="/dashboard/admin/parents"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4 text-white" />
        <span className="text-white font-semibold">Retour à la liste</span>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Nouveau compte parent</CardTitle>
          <CardDescription>
            Les identifiants sont envoyés par email dès la création. Au moins un enfant doit être assigné.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="first_name">Prénom</Label>
                <Input id="first_name" {...register('first_name')} aria-invalid={!!errors.first_name} />
                {errors.first_name && <p className="text-sm text-destructive">{errors.first_name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Nom</Label>
                <Input id="last_name" {...register('last_name')} aria-invalid={!!errors.last_name} />
                {errors.last_name && <p className="text-sm text-destructive">{errors.last_name.message}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nickname">Surnom</Label>
              <Input id="nickname" placeholder="Ex. Papa Anaïs" {...register('nickname')} aria-invalid={!!errors.nickname} />
              {errors.nickname && <p className="text-sm text-destructive">{errors.nickname.message}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register('email')} aria-invalid={!!errors.email} />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input id="phone" {...register('phone')} aria-invalid={!!errors.phone} />
                {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Enfants assignés</Label>
              <ChildMultiSelect selected={children} onChange={(c) => { setChildren(c); if (c.length > 0) setChildrenError(null) }} />
              {childrenError && <p className="text-sm text-destructive">{childrenError}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe temporaire</Label>
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
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
              <p className="text-xs text-muted-foreground">
                8 caractères minimum · 1 majuscule · 1 chiffre — envoyé par email au parent.
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting
                ? <><Loader2 className="mr-2 size-4 animate-spin" /> Création...</>
                : 'Créer le compte'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  )
}
