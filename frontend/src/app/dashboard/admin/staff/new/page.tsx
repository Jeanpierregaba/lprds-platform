'use client'

import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { staffApi } from '@/lib/api/staff.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { STAFF_TYPE_LABELS, type StaffType } from '@/types/staff'

const schema = z.object({
  first_name: z.string().min(1, 'Prénom requis').max(100),
  last_name:  z.string().min(1, 'Nom requis').max(100),
  nickname:   z.string().min(1, 'Surnom requis').max(100),
  phone:      z.string().min(1, 'Téléphone requis').max(20),
  email:      z.string().email('Email invalide'),
  staff_type: z.string().min(1, 'Type requis'),
  password:   z.string()
    .min(8, '8 caractères minimum')
    .regex(/[A-Z]/, 'Une majuscule requise')
    .regex(/[0-9]/, 'Un chiffre requis'),
})
type Form = z.infer<typeof schema>

export default function NewStaffPage() {
  const router = useRouter()

  const { register, handleSubmit, control, formState: { errors, isSubmitting } } =
    useForm<Form>({ resolver: zodResolver(schema), defaultValues: { staff_type: '' } })

  const onSubmit = async (values: Form) => {
    try {
      const { data } = await staffApi.create({
        first_name: values.first_name,
        last_name:  values.last_name,
        nickname:   values.nickname,
        phone:      values.phone,
        email:      values.email,
        password:   values.password,
        staff_type: values.staff_type as StaffType,
      })
      toast.success('Membre du personnel créé.')
      router.push(`/dashboard/admin/staff/${data.id}`)
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
        href="/dashboard/admin/staff"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Retour à la liste
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Nouveau membre du personnel</CardTitle>
          <CardDescription>
            Un matricule est généré automatiquement. Les identifiants sont envoyés par email.
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
              <Input id="nickname" placeholder="Ex. Tata Victoire" {...register('nickname')} aria-invalid={!!errors.nickname} />
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
              <Label htmlFor="staff_type">Type de poste</Label>
              <Controller
                control={control}
                name="staff_type"
                render={({ field }) => (
                  <Select items={STAFF_TYPE_LABELS} value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="staff_type" className="w-full" aria-invalid={!!errors.staff_type}>
                      <SelectValue placeholder="Choisir un type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STAFF_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.staff_type && <p className="text-sm text-destructive">{errors.staff_type.message}</p>}
              <p className="text-xs text-muted-foreground">
                Poste purement descriptif — n&apos;attribue aucun droit. Les droits se gèrent depuis
                Rôles &amp; permissions.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe temporaire</Label>
              <Input id="password" type="password" {...register('password')} aria-invalid={!!errors.password} />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
              <p className="text-xs text-muted-foreground">
                8 caractères minimum · 1 majuscule · 1 chiffre — envoyé par email avec le matricule.
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
