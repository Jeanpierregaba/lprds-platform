'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { intlLocale } from '@/lib/utils/locale-format'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { ArrowLeft, ArrowRight, Check, FileUp, Info, Loader2, Plus, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { organizationApi } from '@/lib/api/organization.api'
import { childrenApi } from '@/lib/api/children.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { cn } from '@/lib/utils'
import { BackLink, PageMotion, RightsGuard } from '@/components/dashboard/shared/page'
import { useRouter } from '@/i18n/navigation'

/** Les trois schémas deviennent des fabriques : leurs messages de validation
 *  sont traduits, donc ils ne peuvent plus être résolus au chargement du
 *  module. `T` est la signature minimale d'un traducteur next-intl. */
type T = (key: string) => string

const makeGuardianSchema = (t: T) => z.object({
  last_name: z.string().min(1, t('validation.lastName')).max(100),
  first_names: z.string().min(1, t('validation.firstNames')).max(200),
  phone: z.string().min(1, t('validation.phone')).max(20),
  email: z.string().email(t('validation.email')).optional().or(z.literal('')),
})

const makeAuthorizedPersonSchema = (t: T) => z.object({
  last_name: z.string().min(1, t('validation.lastName')).max(100),
  first_names: z.string().min(1, t('validation.firstNames')).max(200),
  phone: z.string().min(1, t('validation.phone')).max(20),
})

const makeSchema = (t: T) => z.object({
  last_name: z.string().min(1, t('validation.lastName')).max(100),
  first_names: z.string().min(1, t('validation.firstNames')).max(200),
  birth_date: z.string().min(1, t('validation.birthDate')),
  admission_date: z.string().min(1, t('validation.admissionDate')),
  residence_address: z.string().min(1, t('validation.address')).max(500),
  department_id: z.string().optional().or(z.literal('')),
  section_id: z.string().optional().or(z.literal('')),
  behavioral_notes: z.string().max(2000).optional().or(z.literal('')),
  preferences: z.string().max(2000).optional().or(z.literal('')),

  medical_notes: z.string().max(2000).optional().or(z.literal('')),
  dietary_restrictions: z.string().max(2000).optional().or(z.literal('')),
  medications: z.string().max(2000).optional().or(z.literal('')),
  doctor_name: z.string().max(150).optional().or(z.literal('')),
  doctor_phone: z.string().max(20).optional().or(z.literal('')),

  guardians: z.array(makeGuardianSchema(t)).min(1, t('validation.guardianRequired')),
  authorized_persons: z.array(makeAuthorizedPersonSchema(t)),
})
type Form = z.infer<ReturnType<typeof makeSchema>>

const STEP_FIELDS: Record<number, (keyof Form)[]> = {
  0: ['last_name', 'first_names', 'birth_date', 'admission_date', 'residence_address',
      'department_id', 'section_id', 'behavioral_notes', 'preferences'],
  1: ['medical_notes', 'dietary_restrictions', 'medications', 'doctor_name', 'doctor_phone'],
  2: ['guardians', 'authorized_persons'],
  3: [],
  4: [],
}

const STEP_KEYS = ['basic', 'medical', 'guardians', 'documents', 'summary'] as const

const DOCUMENT_MAX_MB = 10
const DOCUMENT_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
]

function formatDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(intlLocale())
}

export default function NewChildPage() {
  const t = useTranslations('children')
  const tCommon = useTranslations('common')
  const schema = makeSchema(t)
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('children:write')
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
    if (valid) setStep((s) => Math.min(s + 1, STEP_KEYS.length - 1))
  }
  const goPrev = () => setStep((s) => Math.max(s - 1, 0))

  const onFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const accepted: File[] = []
    for (const file of Array.from(e.target.files)) {
      if (file.size > DOCUMENT_MAX_MB * 1024 * 1024) {
        toast.error(`« ${file.name} » dépasse ${DOCUMENT_MAX_MB} Mo.`)
        continue
      }
      if (!DOCUMENT_ALLOWED_TYPES.includes(file.type)) {
        toast.error(`« ${file.name} » : seuls les images et PDF sont acceptés.`)
        continue
      }
      accepted.push(file)
    }
    if (accepted.length > 0) setDocuments((prev) => [...prev, ...accepted])
    e.target.value = ''
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

      let uploaded = 0
      for (const file of documents) {
        try {
          await childrenApi.uploadDocument(data.id, file)
          uploaded += 1
        } catch {
          toast.error(t('form.uploadFailed', { name: file.name }))
        }
      }

      if (documents.length === 0) {
        toast.success(t('form.created'))
      } else if (uploaded === documents.length) {
        toast.success(t('form.createdWithDocs'))
      } else {
        toast.error(t('form.partialUpload', { count: documents.length - uploaded }))
      }
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
      toast.error(t('form.invalidFields'))
    }
  }

  const values = getValues()

  if (!canWrite) {
    return (
      <RightsGuard
        message={t('form.noRights')}
        backHref="/dashboard/admin/children"
      />
    )
  }

  return (
    <PageMotion className="mx-auto w-full max-w-2xl space-y-4">
      <BackLink href="/dashboard/admin/children" label={t('form.back')} />

      {/* Indicateur d'étapes */}
      <div className="flex items-center">
        {STEP_KEYS.map((stepKey, i) => (
          <div key={stepKey} className="flex flex-1 items-center last:flex-none">
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
                {t(`form.steps.${stepKey}`)}
              </span>
            </div>
            {i < STEP_KEYS.length - 1 && (
              <div className={cn('mx-2 h-px flex-1', i < step ? 'bg-primary' : 'bg-border')} />
            )}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('form.newTitle')}</CardTitle>
          <CardDescription>
            {t('form.stepIndicator', { current: step + 1, total: STEP_KEYS.length })} — {t(`form.steps.${STEP_KEYS[step]}`)}
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
                        <Label htmlFor="last_name">{t('fields.lastName')}</Label>
                        <Input id="last_name" {...register('last_name')} aria-invalid={!!errors.last_name} />
                        {errors.last_name && <p className="text-sm text-destructive">{errors.last_name.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="first_names">{t('fields.firstNames')}</Label>
                        <Input id="first_names" {...register('first_names')} aria-invalid={!!errors.first_names} />
                        {errors.first_names && <p className="text-sm text-destructive">{errors.first_names.message}</p>}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="birth_date">{t('fields.birthDate')}</Label>
                        <Input id="birth_date" type="date" {...register('birth_date')} aria-invalid={!!errors.birth_date} />
                        {errors.birth_date && <p className="text-sm text-destructive">{errors.birth_date.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="admission_date">{t('fields.admissionDate')}</Label>
                        <Input id="admission_date" type="date" {...register('admission_date')} aria-invalid={!!errors.admission_date} />
                        {errors.admission_date && <p className="text-sm text-destructive">{errors.admission_date.message}</p>}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="residence_address">{t('fields.address')}</Label>
                      <Input id="residence_address" {...register('residence_address')} aria-invalid={!!errors.residence_address} />
                      {errors.residence_address && <p className="text-sm text-destructive">{errors.residence_address.message}</p>}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="department_id">{t('fields.department')}</Label>
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
                                <SelectValue placeholder={t('fields.noneMale')} />
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
                        <Label htmlFor="section_id">{t('fields.section')}</Label>
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
                                <SelectValue placeholder={t('fields.noneFemale')} />
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
                      <Label htmlFor="behavioral_notes">{t('fields.behavioralNotes')}</Label>
                      <Textarea id="behavioral_notes" rows={2} {...register('behavioral_notes')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="preferences">{t('fields.preferences')}</Label>
                      <Textarea id="preferences" rows={2} {...register('preferences')} />
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="medical_notes">{t('fields.medicalNotes')}</Label>
                      <Textarea id="medical_notes" rows={2} {...register('medical_notes')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dietary_restrictions">{t('fields.dietaryRestrictions')}</Label>
                      <Textarea id="dietary_restrictions" rows={2} {...register('dietary_restrictions')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="medications">{t('fields.medications')}</Label>
                      <Textarea id="medications" rows={2} {...register('medications')} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="doctor_name">{t('fields.doctorName')}</Label>
                        <Input id="doctor_name" {...register('doctor_name')} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="doctor_phone">{t('fields.doctorPhone')}</Label>
                        <Input id="doctor_phone" {...register('doctor_phone')} />
                      </div>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">{t('form.guardiansHeading')}</h3>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => guardianFields.append({ last_name: '', first_names: '', phone: '', email: '' })}
                        >
                          <Plus className="mr-1.5 size-4" />
                          {t('form.addGuardian')}
                        </Button>
                      </div>
                      {errors.guardians?.message && (
                        <p className="text-sm text-destructive">{errors.guardians.message}</p>
                      )}
                      <div className="space-y-4">
                        {guardianFields.fields.map((field, index) => (
                          <div key={field.id} className="space-y-3 rounded-md border border-border p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium text-muted-foreground">{t('form.guardianN', { n: index + 1 })}</p>
                              {guardianFields.fields.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => guardianFields.remove(index)}
                                  aria-label={t('form.removeGuardian', { n: index + 1 })}
                                >
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label htmlFor={`guardians.${index}.last_name`}>{t('fields.lastName')}</Label>
                                <Input id={`guardians.${index}.last_name`} {...register(`guardians.${index}.last_name`)} />
                                {errors.guardians?.[index]?.last_name && (
                                  <p className="text-sm text-destructive">{errors.guardians[index]?.last_name?.message}</p>
                                )}
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor={`guardians.${index}.first_names`}>{t('fields.firstNames')}</Label>
                                <Input id={`guardians.${index}.first_names`} {...register(`guardians.${index}.first_names`)} />
                                {errors.guardians?.[index]?.first_names && (
                                  <p className="text-sm text-destructive">{errors.guardians[index]?.first_names?.message}</p>
                                )}
                              </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label htmlFor={`guardians.${index}.phone`}>{t('fields.phone')}</Label>
                                <Input id={`guardians.${index}.phone`} {...register(`guardians.${index}.phone`)} />
                                {errors.guardians?.[index]?.phone && (
                                  <p className="text-sm text-destructive">{errors.guardians[index]?.phone?.message}</p>
                                )}
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor={`guardians.${index}.email`}>{t('fields.email')}</Label>
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
                        <h3 className="text-sm font-semibold">{t('form.authorizedHeading')}</h3>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => authorizedFields.append({ last_name: '', first_names: '', phone: '' })}
                        >
                          <Plus className="mr-1.5 size-4" />
                          {t('form.add')}
                        </Button>
                      </div>
                      <div className="space-y-4">
                        {authorizedFields.fields.map((field, index) => (
                          <div key={field.id} className="space-y-3 rounded-md border border-border p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-medium text-muted-foreground">{t('form.personN', { n: index + 1 })}</p>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => authorizedFields.remove(index)}
                                aria-label={t('form.removePerson', { n: index + 1 })}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label htmlFor={`authorized_persons.${index}.last_name`}>{t('fields.lastName')}</Label>
                                <Input id={`authorized_persons.${index}.last_name`} {...register(`authorized_persons.${index}.last_name`)} />
                                {errors.authorized_persons?.[index]?.last_name && (
                                  <p className="text-sm text-destructive">{errors.authorized_persons[index]?.last_name?.message}</p>
                                )}
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor={`authorized_persons.${index}.first_names`}>{t('fields.firstNames')}</Label>
                                <Input id={`authorized_persons.${index}.first_names`} {...register(`authorized_persons.${index}.first_names`)} />
                                {errors.authorized_persons?.[index]?.first_names && (
                                  <p className="text-sm text-destructive">{errors.authorized_persons[index]?.first_names?.message}</p>
                                )}
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`authorized_persons.${index}.phone`}>{t('fields.phone')}</Label>
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
                        {t('form.chooseFiles')}
                      </Label>
                      <input
                        id="documents"
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                        className="hidden"
                        onChange={onFilesSelected}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">{t('documentsHint')}</p>
                    </div>

                    <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
                      <Info className="mt-0.5 size-4 shrink-0" />
                      <span>
                        {t('form.documentsHintUpload', { max: DOCUMENT_MAX_MB })}
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
                              aria-label={tCommon('actions.removeNamed', { name: file.name })}
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
                      <h3 className="text-sm font-semibold">{t('form.steps.basic')}</h3>
                      <div className="grid gap-x-4 gap-y-1.5 rounded-md border border-border p-3 text-sm sm:grid-cols-2">
                        <p><span className="text-muted-foreground">{t('summary.lastName')} </span>{values.last_name || '—'}</p>
                        <p><span className="text-muted-foreground">{t('summary.firstNames')} </span>{values.first_names || '—'}</p>
                        <p><span className="text-muted-foreground">{t('summary.birth')} </span>{formatDate(values.birth_date)}</p>
                        <p><span className="text-muted-foreground">{t('summary.admission')} </span>{formatDate(values.admission_date)}</p>
                        <p className="sm:col-span-2"><span className="text-muted-foreground">{t('summary.address')} </span>{values.residence_address || '—'}</p>
                        <p><span className="text-muted-foreground">{t('summary.department')} </span>{departmentName(values.department_id ?? '') ?? '—'}</p>
                        <p><span className="text-muted-foreground">{t('summary.section')} </span>{sectionName(values.section_id ?? '') ?? '—'}</p>
                        {values.behavioral_notes && (
                          <p className="sm:col-span-2"><span className="text-muted-foreground">{t('summary.behavioralNotes')} </span>{values.behavioral_notes}</p>
                        )}
                        {values.preferences && (
                          <p className="sm:col-span-2"><span className="text-muted-foreground">{t('summary.preferences')} </span>{values.preferences}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">{t('form.steps.medical')}</h3>
                      <div className="space-y-1.5 rounded-md border border-border p-3 text-sm">
                        <p><span className="text-muted-foreground">{t('summary.medicalNotes')} </span>{values.medical_notes || '—'}</p>
                        <p><span className="text-muted-foreground">{t('summary.dietaryRestrictions')} </span>{values.dietary_restrictions || '—'}</p>
                        <p><span className="text-muted-foreground">{t('summary.medications')} </span>{values.medications || '—'}</p>
                        <p><span className="text-muted-foreground">{t('summary.doctor')} </span>{values.doctor_name || '—'} {values.doctor_phone && `(${values.doctor_phone})`}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">{t('summary.guardiansCount', { count: values.guardians.length })}</h3>
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
                        <h3 className="text-sm font-semibold">{t('summary.personsCount', { count: values.authorized_persons.length })}</h3>
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
                      <h3 className="text-sm font-semibold">{t('summary.documentsCount', { count: documents.length })}</h3>
                      {documents.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('form.noDocument')}</p>
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
                {t('form.previous')}
              </Button>

              {step < STEP_KEYS.length - 1 ? (
                <Button key="next" type="button" onClick={goNext}>
                  {t('form.next')}
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
                    ? <><Loader2 className="mr-2 size-4 animate-spin" /> {t('form.submitting')}</>
                    : t('form.submit')}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </PageMotion>
  )
}
