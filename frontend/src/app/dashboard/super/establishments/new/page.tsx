'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { establishmentsApi } from '@/lib/api/establishments.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'

const schema = z.object({
  code:    z.string().min(2, '2 caractères minimum').max(10, '10 caractères maximum')
    .regex(/^[A-Za-z0-9]+$/, 'Alphanumérique uniquement'),
  name:    z.string().min(1, 'Nom requis').max(200),
  address: z.string().min(1, 'Adresse requise').max(500),
  email:   z.string().email('Email invalide'),
  phone:   z.string().min(1, 'Téléphone requis').max(20),

  admin_first_name: z.string().min(1, 'Prénom requis').max(100),
  admin_last_name:  z.string().min(1, 'Nom requis').max(100),
  admin_email:      z.string().email('Email invalide'),
  admin_phone:      z.string().max(20).optional().or(z.literal('')),
  admin_password:   z.string()
    .min(8, '8 caractères minimum')
    .regex(/[A-Z]/, 'Une majuscule requise')
    .regex(/[0-9]/, 'Un chiffre requis'),
})

type Form = z.infer<typeof schema>

export default function NewEstablishmentPage() {
  const router = useRouter()

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<Form>({ resolver: zodResolver(schema) })

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
      toast.success('Établissement créé.')
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
        Retour à la liste
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Nouvel établissement</CardTitle>
          <CardDescription>
            Créer un établissement et son premier administrateur.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Établissement</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="code">Code</Label>
                  <Input id="code" placeholder="LPRDS" {...register('code')} aria-invalid={!!errors.code} />
                  {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Nom</Label>
                  <Input id="name" {...register('name')} aria-invalid={!!errors.name} />
                  {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Adresse</Label>
                <Input id="address" {...register('address')} aria-invalid={!!errors.address} />
                {errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
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
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Premier administrateur</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="admin_first_name">Prénom</Label>
                  <Input id="admin_first_name" {...register('admin_first_name')} aria-invalid={!!errors.admin_first_name} />
                  {errors.admin_first_name && <p className="text-sm text-destructive">{errors.admin_first_name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin_last_name">Nom</Label>
                  <Input id="admin_last_name" {...register('admin_last_name')} aria-invalid={!!errors.admin_last_name} />
                  {errors.admin_last_name && <p className="text-sm text-destructive">{errors.admin_last_name.message}</p>}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="admin_email">Email</Label>
                  <Input id="admin_email" type="email" {...register('admin_email')} aria-invalid={!!errors.admin_email} />
                  {errors.admin_email && <p className="text-sm text-destructive">{errors.admin_email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin_phone">Téléphone (optionnel)</Label>
                  <Input id="admin_phone" {...register('admin_phone')} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin_password">Mot de passe temporaire</Label>
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
                : 'Créer l’établissement'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  )
}
