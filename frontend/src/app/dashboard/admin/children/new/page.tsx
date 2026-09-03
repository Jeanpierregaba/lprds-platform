'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Check, FileUp, Loader2, Plus, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { organizationApi } from '@/lib/api/organization.api'
import { childrenApi } from '@/lib/api/children.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { cn } from '@/lib/utils'

const guardianSchema = z.object({
  last_name: z.string().min(1, 'Nom requis').max(100),
  first_names: z.string().min(1, 'Prénoms requis').max(200),
  phone: z.string().min(1, 'Téléphone requis').max(20),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
})

const authorizedPersonSchema = z.object({
  last_name: z.string().min(1, 'Nom requis').max(100),
  first_names: z.string().min(1, 'Prénoms requis').max(200),
  phone: z.string().min(1, 'Téléphone requis').max(20),
})

const schema = z.object({
  last_name: z.string().min(1, 'Nom requis').max(100),
  first_names: z.string().min(1, 'Prénoms requis').max(200),
  birth_date: z.string().min(1, 'Date de naissance requise'),
  admission_date: z.string().min(1, "Date d'admission requise"),
  residence_address: z.string().min(1, 'Adresse requise').max(500),
  department_id: z.string().optional().or(z.literal('')),
  section_id: z.string().optional().or(z.literal('')),
  behavioral_notes: z.string().max(2000).optional().or(z.literal('')),
  preferences: z.string().max(2000).optional().or(z.literal('')),

  medical_notes: z.string().max(2000).optional().or(z.literal('')),
  dietary_restrictions: z.string().max(2000).optional().or(z.literal('')),
  medications: z.string().max(2000).optional().or(z.literal('')),
  doctor_name: z.string().max(150).optional().or(z.literal('')),
  doctor_phone: z.string().max(20).optional().or(z.literal('')),

  guardians: z.array(guardianSchema).min(1, 'Au moins un tuteur est requis'),
  authorized_persons: z.array(authorizedPersonSchema),
})
type Form = z.infer<typeof schema>

const STEP_FIELDS: Record<number, (keyof Form)[]> = {
  0: ['last_name', 'first_names', 'birth_date', 'admission_date', 'residence_address',
      'department_id', 'section_id', 'behavioral_notes', 'preferences'],
  1: ['medical_notes', 'dietary_restrictions', 'medications', 'doctor_name', 'doctor_phone'],
  2: ['guardians', 'authorized_persons'],
  3: [],
  4: [],
}

const STEPS = [
  'Informations de base',
  'Médical',
  'Parents / tuteurs',
  'Documents',
  'Résumé',
]

function formatDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR')
}

export default function NewChildPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [documents, setDocuments] = useState<File[]>([])

  const { data: departments } = useQuery({
    queryKey: ['departments', { includeInactive: false }],
    queryFn: () => organizationApi.listDepartments(false).then((r) => r.data),
  })

  const {
    register, handleSubmit, control, watch, trigger, getValues,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      department_id: '', section_id: '',
      behavioral_notes: '', preferences: '',
      medical_notes: '', dietary_restrictions: '', medications: '', doctor_name: '', doctor_phone: '',
      guardians: [{ last_name: '', first_names: '', phone: '', email: '' }],
      authorized_persons: [],
    },
  })

  const departmentId = watch('department_id')

  const { data: sections } = useQuery({
    queryKey: ['sections', { departmentId: departmentId || '__all__', includeInactive: false }],
    queryFn: () =>
      organizationApi
        .listSections({ department_id: departmentId || undefined, include_inactive: false })
        .then((r) => r.data),
  })

  const guardianFields = useFieldArray({ control, name: 'guardians' })
  const authorizedFields = useFieldArray({ control, name: 'authorized_persons' })

  const departmentName = (id: string) => departments?.find((d) => d.id === id)?.name
  const sectionName = (id: string) => sections?.find((s) => s.id === id)?.name

  const goNext = async () => {
    const valid = await trigger(STEP_FIELDS[step])
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }
  const goPrev = () => setStep((s) => Math.max(s - 1, 0))

  const onFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setDocuments((prev) => [...prev, ...Array.from(e.target.files!)])
      e.target.value = ''
    }
  }

  const onSubmit = async (values: Form) => {
    try {
      const { data } = await childrenApi.create({
        last_name: values.last_name,
        first_names: values.first_names,
        birth_date: values.birth_date,
        admission_date: values.admission_date,
        residence_address: values.residence_address,
        department_id: values.department_id || undefined,
        section_id: values.section_id || undefined,
        behavioral_notes: values.behavioral_notes || undefined,
        preferences: values.preferences || undefined,
        medical_notes: values.medical_notes || undefined,
        dietary_restrictions: values.dietary_restrictions || undefined,
        medications: values.medications || undefined,
        doctor_name: values.doctor_name || undefined,
        doctor_phone: values.doctor_phone || undefined,
        guardians: values.guardians.map((g) => ({ ...g, email: g.email || undefined })),
        authorized_persons: values.authorized_persons,
      })
      toast.success('Fiche enfant créée.')
      router.push(`/dashboard/admin/children/${data.id}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  const onInvalid = (formErrors: typeof errors) => {
    const invalidFieldNames = Object.keys(formErrors)
    const firstInvalidStep = Object.entries(STEP_FIELDS).find(([, fields]) =>
      fields.some((f) => invalidFieldNames.includes(f))
    )?.[0]
    if (firstInvalidStep !== undefined) {
      setStep(Number(firstInvalidStep))
      toast.error('Certains champs nécessitent votre attention.')
    }
  }

  const values = getValues()

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="mx-auto w-full max-w-2xl space-y-4"
    >
      <Link
        href="/dashboard/admin/children"
        className="inline-flex items-center gap-1.5 text-sm text-white hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        <span className="text-white font-semibold">Retour à la liste</span>
      </Link>

      {/* Indicateur d'étapes */}
      <div className="flex items-center">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors',
                  i < step
                    ? 'bg-primary text-primary-foreground'
                    : i === step
                      ? 'bg-primary border-2 border-secondary text-accent'
                      : 'border border-border text-accent'
                )}
              >
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </div>
              <span className={cn('hidden text-center text-xs sm:block', i === step ? 'font-medium text-primary' : 'text-white')}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn('mx-2 h-px flex-1', i < step ? 'bg-primary' : 'bg-border')} />
            )}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nouvelle fiche enfant</CardTitle>
          <CardDescription>
            Étape {step + 1} sur {STEPS.length} — {STEPS[step]}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate>
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {step === 0 && (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="last_name">Nom</Label>
                        <Input id="last_name" {...register('last_name')} aria-invalid={!!errors.last_name} />
                        {errors.last_name && <p className="text-sm text-destructive">{errors.last_name.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="first_names">Prénoms</Label>
                        <Input id="first_names" {...register('first_names')} aria-invalid={!!errors.first_names} />
                        {errors.first_names && <p className="text-sm text-destructive">{errors.first_names.message}</p>}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="birth_date">Date de naissance</Label>
                        <Input id="birth_date" type="date" {...register('birth_date')} aria-invalid={!!errors.birth_date} />
                        {errors.birth_date && <p className="text-sm text-destructive">{errors.birth_date.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="admission_date">Date d&apos;admission</Label>
                        <Input id="admission_date" type="date" {...register('admission_date')} aria-invalid={!!errors.admission_date} />
                        {errors.admission_date && <p className="text-sm text-destructive">{errors.admission_date.message}</p>}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="residence_address">Adresse de résidence</Label>
                      <Input id="residence_address" {...register('residence_address')} aria-invalid={!!errors.residence_address} />
                      {errors.residence_address && <p className="text-sm text-destructive">{errors.residence_address.message}</p>}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="department_id">Département (optionnel)</Label>
                        <Controller
                          control={control}
                          name="department_id"
                          render={({ field }) => (
                            <Select
                              items={Object.fromEntries((departments ?? []).map((d) => [d.id, d.name]))}
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger id="department_id" className="w-full">
                                <SelectValue placeholder="Aucun" />
                              </SelectTrigger>
                              <SelectContent>
                                {departments?.map((d) => (
                                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="section_id">Section (optionnelle)</Label>
                        <Controller
                          control={control}
                          name="section_id"
                          render={({ field }) => (
                            <Select
                              items={Object.fromEntries((sections ?? []).map((s) => [s.id, s.name]))}
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <SelectTrigger id="section_id" className="w-full">
                                <SelectValue placeholder="Aucune" />
                              </SelectTrigger>
                              <SelectContent>
                                {sections?.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor="behavioral_notes">Notes comportementales (optionnel)</Label>
                      <Textarea id="behavioral_notes" rows={2} {...register('behavioral_notes')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="preferences">Préférences (optionnel)</Label>
                      <Textarea id="preferences" rows={2} {...register('preferences')} />
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="medical_notes">Notes médicales</Label>
                      <Textarea id="medical_notes" rows={2} {...register('medical_notes')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dietary_restrictions">Restrictions alimentaires</Label>
                      <Textarea id="dietary_restrictions" rows={2} {...register('dietary_restrictions')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="medications">Médicaments</Label>
                      <Textarea id="medications" rows={2} {...register('medications')} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="doctor_name">Médecin traitant</Label>
                        <Input id="doctor_name" {...register('doctor_name')} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="doctor_phone">Téléphone du médecin</Label>
                        <Input id="doctor_phone" {...register('doctor_phone')} />
                      </div>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Tuteurs</h3>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => guardianFields.append({ last_name: '', first_names: '', phone: '', email: '' })}
                        >
                          <Plus className="mr-1.5 size-4" />
                          Ajouter un tuteur
                        </Button>
                      </div>
                      {errors.guardians?.message && (
                        <p className="text-sm text-destructive">{errors.guardians.message}</p>
                      )}
                      <div className="space-y-4">
                        {guardianFields.fields.map((field, index) => (
                          <div key={field.id} className="space-y-3 rounded-md border border-border p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium text-muted-foreground">Tuteur {index + 1}</p>
                              {guardianFields.fields.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => guardianFields.remove(index)}
                                  aria-label={`Retirer le tuteur ${index + 1}`}
                                >
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label htmlFor={`guardians.${index}.last_name`}>Nom</Label>
                                <Input id={`guardians.${index}.last_name`} {...register(`guardians.${index}.last_name`)} />
                                {errors.guardians?.[index]?.last_name && (
                                  <p className="text-sm text-destructive">{errors.guardians[index]?.last_name?.message}</p>
                                )}
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor={`guardians.${index}.first_names`}>Prénoms</Label>
                                <Input id={`guardians.${index}.first_names`} {...register(`guardians.${index}.first_names`)} />
                                {errors.guardians?.[index]?.first_names && (
                                  <p className="text-sm text-destructive">{errors.guardians[index]?.first_names?.message}</p>
                                )}
                              </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label htmlFor={`guardians.${index}.phone`}>Téléphone</Label>
                                <Input id={`guardians.${index}.phone`} {...register(`guardians.${index}.phone`)} />
                                {errors.guardians?.[index]?.phone && (
                                  <p className="text-sm text-destructive">{errors.guardians[index]?.phone?.message}</p>
                                )}
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor={`guardians.${index}.email`}>Email (optionnel)</Label>
                                <Input id={`guardians.${index}.email`} type="email" {...register(`guardians.${index}.email`)} />
                                {errors.guardians?.[index]?.email && (
                                  <p className="text-sm text-destructive">{errors.guardians[index]?.email?.message}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Personnes autorisées (optionnel)</h3>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => authorizedFields.append({ last_name: '', first_names: '', phone: '' })}
                        >
                          <Plus className="mr-1.5 size-4" />
                          Ajouter
                        </Button>
                      </div>
                      <div className="space-y-4">
                        {authorizedFields.fields.map((field, index) => (
                          <div key={field.id} className="space-y-3 rounded-md border border-border p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium text-muted-foreground">Personne {index + 1}</p>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => authorizedFields.remove(index)}
                                aria-label={`Retirer la personne ${index + 1}`}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label htmlFor={`authorized_persons.${index}.last_name`}>Nom</Label>
                                <Input id={`authorized_persons.${index}.last_name`} {...register(`authorized_persons.${index}.last_name`)} />
                                {errors.authorized_persons?.[index]?.last_name && (
                                  <p className="text-sm text-destructive">{errors.authorized_persons[index]?.last_name?.message}</p>
                                )}
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor={`authorized_persons.${index}.first_names`}>Prénoms</Label>
                                <Input id={`authorized_persons.${index}.first_names`} {...register(`authorized_persons.${index}.first_names`)} />
                                {errors.authorized_persons?.[index]?.first_names && (
                                  <p className="text-sm text-destructive">{errors.authorized_persons[index]?.first_names?.message}</p>
                                )}
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`authorized_persons.${index}.phone`}>Téléphone</Label>
                              <Input id={`authorized_persons.${index}.phone`} {...register(`authorized_persons.${index}.phone`)} />
                              {errors.authorized_persons?.[index]?.phone && (
                                <p className="text-sm text-destructive">{errors.authorized_persons[index]?.phone?.message}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-4">
                    <div className="rounded-md border border-dashed border-border p-6 text-center">
                      <FileUp className="mx-auto mb-2 size-6 text-muted-foreground" />
                      <Label htmlFor="documents" className="cursor-pointer text-sm font-medium text-primary">
                        Choisir des fichiers
                      </Label>
                      <input
                        id="documents"
                        type="file"
                        multiple
                        className="hidden"
                        onChange={onFilesSelected}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Pièces d&apos;identité, certificats, autorisations...
                      </p>
                    </div>

                    <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
                      <Badge variant="outline" className="shrink-0 font-normal">À venir</Badge>
                      <span>
                        L&apos;envoi de documents au serveur n&apos;est pas encore disponible côté plateforme.
                        Les fichiers sélectionnés ici restent dans votre navigateur et n&apos;accompagnent pas
                        encore la fiche créée.
                      </span>
                    </div>

                    {documents.length > 0 && (
                      <ul className="space-y-2">
                        {documents.map((file, index) => (
                          <li key={`${file.name}-${index}`} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                            <span className="truncate">{file.name}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Retirer ${file.name}`}
                              onClick={() => setDocuments((prev) => prev.filter((_, i) => i !== index))}
                            >
                              <X className="size-4" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">Informations de base</h3>
                      <div className="grid gap-x-4 gap-y-1.5 rounded-md border border-border p-3 text-sm sm:grid-cols-2">
                        <p><span className="text-muted-foreground">Nom : </span>{values.last_name || '—'}</p>
                        <p><span className="text-muted-foreground">Prénoms : </span>{values.first_names || '—'}</p>
                        <p><span className="text-muted-foreground">Naissance : </span>{formatDate(values.birth_date)}</p>
                        <p><span className="text-muted-foreground">Admission : </span>{formatDate(values.admission_date)}</p>
                        <p className="sm:col-span-2"><span className="text-muted-foreground">Adresse : </span>{values.residence_address || '—'}</p>
                        <p><span className="text-muted-foreground">Département : </span>{departmentName(values.department_id ?? '') ?? '—'}</p>
                        <p><span className="text-muted-foreground">Section : </span>{sectionName(values.section_id ?? '') ?? '—'}</p>
                        {values.behavioral_notes && (
                          <p className="sm:col-span-2"><span className="text-muted-foreground">Notes comportementales : </span>{values.behavioral_notes}</p>
                        )}
                        {values.preferences && (
                          <p className="sm:col-span-2"><span className="text-muted-foreground">Préférences : </span>{values.preferences}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">Médical</h3>
                      <div className="space-y-1.5 rounded-md border border-border p-3 text-sm">
                        <p><span className="text-muted-foreground">Notes médicales : </span>{values.medical_notes || '—'}</p>
                        <p><span className="text-muted-foreground">Restrictions alimentaires : </span>{values.dietary_restrictions || '—'}</p>
                        <p><span className="text-muted-foreground">Médicaments : </span>{values.medications || '—'}</p>
                        <p><span className="text-muted-foreground">Médecin : </span>{values.doctor_name || '—'} {values.doctor_phone && `(${values.doctor_phone})`}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">Tuteurs ({values.guardians.length})</h3>
                      <div className="space-y-2">
                        {values.guardians.map((g, i) => (
                          <div key={i} className="rounded-md border border-border p-3 text-sm">
                            <p className="font-medium">{g.first_names} {g.last_name}</p>
                            <p className="text-muted-foreground">{g.phone} {g.email && `· ${g.email}`}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {values.authorized_persons.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-semibold">Personnes autorisées ({values.authorized_persons.length})</h3>
                        <div className="space-y-2">
                          {values.authorized_persons.map((p, i) => (
                            <div key={i} className="rounded-md border border-border p-3 text-sm">
                              <p className="font-medium">{p.first_names} {p.last_name}</p>
                              <p className="text-muted-foreground">{p.phone}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">Documents ({documents.length})</h3>
                      {documents.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Aucun document sélectionné.</p>
                      ) : (
                        <ul className="space-y-1 text-sm text-muted-foreground">
                          {documents.map((f, i) => <li key={i}>{f.name}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="mt-6 flex justify-between border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={goPrev} disabled={step === 0}>
                <ArrowLeft className="mr-1.5 size-4" />
                Précédent
              </Button>

              {step < STEPS.length - 1 ? (
                <Button key="next" type="button" onClick={goNext}>
                  Suivant
                  <ArrowRight className="ml-1.5 size-4" />
                </Button>
              ) : (
                <Button
                  key="submit"
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleSubmit(onSubmit, onInvalid)}
                >
                  {isSubmitting
                    ? <><Loader2 className="mr-2 size-4 animate-spin" /> Création...</>
                    : 'Créer la fiche'}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  )
}
