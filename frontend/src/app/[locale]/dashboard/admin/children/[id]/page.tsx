'use client'

import { useTranslations } from 'next-intl'

import { useRef, useState } from 'react'
import { intlLocale } from '@/lib/utils/locale-format'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Download, FileUp, Loader2, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { organizationApi } from '@/lib/api/organization.api'
import { childrenApi } from '@/lib/api/children.api'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { downloadBlob } from '@/lib/utils/download'
import { BackLink, PageMotion } from '@/components/dashboard/shared/page'
import { DetailSkeleton, StatusPill } from '@/components/dashboard/shared/cards'
import { ConfirmDialog } from '@/components/dashboard/shared/dialogs'
import type { Child, ChildDocument } from '@/types/children'
import {
  ACCEPT_DOCUMENT,
  isObviouslyRejectedDocument,
  isPdfOverLimit,
} from '@/lib/utils/uploads'
import { formatBytes } from '@/lib/utils/locale-format'

type T = (key: string) => string

const makeInfoSchema = (t: T) => z.object({
  last_name: z.string().min(1, t('validation.lastName')).max(100),
  first_names: z.string().min(1, t('validation.firstNames')).max(200),
  birth_date: z.string().min(1, t('validation.birthDate')),
  admission_date: z.string().min(1, t('validation.admissionDate')),
  residence_address: z.string().min(1, t('validation.address')).max(500),
  department_id: z.string(),
  section_id: z.string(),
})
type InfoForm = z.infer<ReturnType<typeof makeInfoSchema>>

const behaviorSchema = z.object({
  behavioral_notes: z.string().max(2000).optional().or(z.literal('')),
  preferences: z.string().max(2000).optional().or(z.literal('')),
})
type BehaviorForm = z.infer<typeof behaviorSchema>

const medicalSchema = z.object({
  medical_notes: z.string().max(2000).optional().or(z.literal('')),
  dietary_restrictions: z.string().max(2000).optional().or(z.literal('')),
  medications: z.string().max(2000).optional().or(z.literal('')),
  doctor_name: z.string().max(150).optional().or(z.literal('')),
  doctor_phone: z.string().max(20).optional().or(z.literal('')),
})
type MedicalForm = z.infer<typeof medicalSchema>

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
const makeContactsSchema = (t: T) => z.object({
  guardians: z.array(makeGuardianSchema(t)).min(1, t('validation.guardianRequired')),
  authorized_persons: z.array(makeAuthorizedPersonSchema(t)),
})
type ContactsForm = z.infer<ReturnType<typeof makeContactsSchema>>

export default function ChildDetailPage() {
  const t = useTranslations('children')
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('children:write')
  const canArchive = user?.role === 'admin' || permissions.has('children:archive')

  const { data: child, isLoading } = useQuery({
    queryKey: ['child', id],
    queryFn: () => childrenApi.get(id).then((r) => r.data),
  })

  const [confirmArchive, setConfirmArchive] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['child', id] })

  const toggleActiveMutation = useMutation({
    mutationFn: () => childrenApi.setStatus(id, !child?.is_active),
    onSuccess: () => {
      toast.success(child?.is_active ? t('status.deactivated') : t('status.reactivated'))
      invalidate()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  if (isLoading) {
    return <DetailSkeleton />
  }

  if (!child) {
    return <p className="text-muted-foreground">{t('detail.notFound')}</p>
  }

  return (
    <PageMotion className="max-w-3xl space-y-4">
      <BackLink href="/dashboard/admin/children" label={t('form.back')} />

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{child.first_names} {child.last_name}</h1>
            <StatusPill active={child.is_active} />
          </div>
          <p className="font-mono text-sm text-white">{child.matricule}</p>
        </div>

        {canArchive && (
        <>
          <Button variant={child.is_active ? 'destructive' : 'outline'} onClick={() => setConfirmArchive(true)}>
            {child.is_active ? t('status.deactivate') : t('status.reactivate')}
          </Button>
          <ConfirmDialog
            open={confirmArchive}
            onOpenChange={setConfirmArchive}
            title={child.is_active ? t('status.confirmTitle') : t('detail.reactivateTitle')}
            description={
              child.is_active
                ? t('detail.deactivateBody')
                : t('detail.reactivateBody')
            }
            confirmLabel={t('detail.confirm')}
            onConfirm={() => {
              setConfirmArchive(false)
              toggleActiveMutation.mutate()
            }}
          />
        </>
        )}
      </div>

      <Tabs defaultValue="infos">
        <TabsList>
          <TabsTrigger value="infos">{t('detail.tabs.infos')}</TabsTrigger>
          <TabsTrigger value="behavior">{t('detail.tabs.behavior')}</TabsTrigger>
          <TabsTrigger value="medical">{t('detail.tabs.medical')}</TabsTrigger>
          <TabsTrigger value="contacts">{t('detail.tabs.contacts', { count: child.guardians.length })}</TabsTrigger>
          <TabsTrigger value="documents">{t('detail.tabs.documents', { count: child.documents.length })}</TabsTrigger>
        </TabsList>

        <TabsContent value="infos">
          <InfoTab childId={id} child={child} onSaved={invalidate} canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="behavior">
          <BehaviorTab childId={id} child={child} onSaved={invalidate} canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="medical">
          <MedicalTab childId={id} child={child} onSaved={invalidate} canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="contacts">
          <ContactsTab childId={id} child={child} onSaved={invalidate} canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsTab childId={id} child={child} onSaved={invalidate} canWrite={canWrite} />
        </TabsContent>
      </Tabs>
    </PageMotion>
  )
}

type TabProps = { childId: string; child: Child; onSaved: () => void; canWrite: boolean }

function InfoTab({ childId, child, onSaved, canWrite }: TabProps) {
  const t = useTranslations('children')
  const { data: departments } = useQuery({
    queryKey: ['departments', { includeInactive: false }],
    queryFn: () => organizationApi.listDepartments(false).then((r) => r.data),
  })

  const { register, handleSubmit, control, watch, formState: { errors, isSubmitting } } = useForm<InfoForm>({
    resolver: zodResolver(makeInfoSchema(t)),
    defaultValues: {
      last_name: child.last_name,
      first_names: child.first_names,
      birth_date: child.birth_date,
      admission_date: child.admission_date,
      residence_address: child.residence_address,
      department_id: child.department?.id ?? '',
      section_id: child.section?.id ?? '',
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

  const onSubmit = async (values: InfoForm) => {
    try {
      await childrenApi.update(childId, {
        last_name: values.last_name,
        first_names: values.first_names,
        birth_date: values.birth_date,
        admission_date: values.admission_date,
        residence_address: values.residence_address,
        department_id: values.department_id || null,
        section_id: values.section_id || null,
      })
      toast.success(t('detail.updated'))
      onSaved()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
              <Label htmlFor="department_id">{t('detail.department')}</Label>
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
                      <SelectValue placeholder={t('fields.noneM')} />
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
              <Label htmlFor="section_id">{t('detail.section')}</Label>
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
                      <SelectValue placeholder={t('fields.noneF')} />
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
          <div className="flex justify-end">
            {canWrite && (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="mr-2 size-4 animate-spin" /> {t('detail.saving')}</> : t('detail.save')}
            </Button>
          )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function BehaviorTab({ childId, child, onSaved, canWrite }: TabProps) {
  const t = useTranslations('children')
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<BehaviorForm>({
    resolver: zodResolver(behaviorSchema),
    defaultValues: {
      behavioral_notes: child.behavioral_notes ?? '',
      preferences: child.preferences ?? '',
    },
  })

  const onSubmit = async (values: BehaviorForm) => {
    try {
      await childrenApi.update(childId, {
        behavioral_notes: values.behavioral_notes || null,
        preferences: values.preferences || null,
      })
      toast.success(t('detail.updated'))
      onSaved()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="behavioral_notes">{t('detail.behavioralNotes')}</Label>
            <Textarea id="behavioral_notes" rows={4} {...register('behavioral_notes')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preferences">{t('detail.preferences')}</Label>
            <Textarea id="preferences" rows={4} {...register('preferences')} />
          </div>
          <div className="flex justify-end">
            {canWrite && (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="mr-2 size-4 animate-spin" /> {t('detail.saving')}</> : t('detail.save')}
            </Button>
          )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function MedicalTab({ childId, child, onSaved, canWrite }: TabProps) {
  const t = useTranslations('children')
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<MedicalForm>({
    resolver: zodResolver(medicalSchema),
    defaultValues: {
      medical_notes: child.medical_notes ?? '',
      dietary_restrictions: child.dietary_restrictions ?? '',
      medications: child.medications ?? '',
      doctor_name: child.doctor_name ?? '',
      doctor_phone: child.doctor_phone ?? '',
    },
  })

  const onSubmit = async (values: MedicalForm) => {
    try {
      await childrenApi.update(childId, {
        medical_notes: values.medical_notes || null,
        dietary_restrictions: values.dietary_restrictions || null,
        medications: values.medications || null,
        doctor_name: values.doctor_name || null,
        doctor_phone: values.doctor_phone || null,
      })
      toast.success(t('detail.updated'))
      onSaved()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="medical_notes">{t('fields.medicalNotes')}</Label>
            <Textarea id="medical_notes" rows={3} {...register('medical_notes')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dietary_restrictions">{t('fields.dietaryRestrictions')}</Label>
            <Textarea id="dietary_restrictions" rows={3} {...register('dietary_restrictions')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="medications">{t('fields.medications')}</Label>
            <Textarea id="medications" rows={3} {...register('medications')} />
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
          <div className="flex justify-end">
            {canWrite && (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="mr-2 size-4 animate-spin" /> {t('detail.saving')}</> : t('detail.save')}
            </Button>
          )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function ContactsTab({ childId, child, onSaved, canWrite }: TabProps) {
  const t = useTranslations('children')
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<ContactsForm>({
    resolver: zodResolver(makeContactsSchema(t)),
    defaultValues: {
      guardians: child.guardians.map((g) => ({ ...g, email: g.email ?? '' })),
      authorized_persons: child.authorized_persons,
    },
  })

  const guardianFields = useFieldArray({ control, name: 'guardians' })
  const authorizedFields = useFieldArray({ control, name: 'authorized_persons' })

  const onSubmit = async (values: ContactsForm) => {
    try {
      await childrenApi.update(childId, {
        guardians: values.guardians.map((g) => ({ ...g, email: g.email || undefined })),
        authorized_persons: values.authorized_persons,
      })
      toast.success(t('detail.contactsUpdated'))
      onSaved()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
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
                    <p className="text-xs font-medium text-muted-foreground">{t('form.guardianIndex', { index: index + 1 })}</p>
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
              <h3 className="text-sm font-semibold">{t('detail.authorizedHeading')}</h3>
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
                    <p className="text-xs font-medium text-muted-foreground">{t('form.authorizedIndex', { index: index + 1 })}</p>
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

          <div className="flex justify-end">
            {canWrite && (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="mr-2 size-4 animate-spin" /> {t('detail.saving')}</> : t('detail.save')}
            </Button>
          )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

const DOCUMENT_MAX_MB = 10

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(intlLocale())
}

function DocumentsTab({ childId, child, onSaved, canWrite }: TabProps) {
  const t = useTranslations('children')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [docToDelete, setDocToDelete] = useState<ChildDocument | null>(null)

  const uploadMutation = useMutation({
    mutationFn: (file: File) => childrenApi.uploadDocument(childId, file),
    onSuccess: () => {
      toast.success(t('detail.docAdded'))
      onSaved()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const removeMutation = useMutation({
    mutationFn: (documentId: string) => childrenApi.removeDocument(childId, documentId),
    onSuccess: () => {
      toast.success(t('detail.docDeleted'))
      onSaved()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Seul le PDF est arrêté sur la taille : une image trop lourde sera
      // allégée par le serveur, la refuser ici serait un faux refus.
      if (isPdfOverLimit(file, DOCUMENT_MAX_MB)) {
        toast.error(t('detail.fileTooBig', { max: DOCUMENT_MAX_MB }))
      } else if (isObviouslyRejectedDocument(file)) {
        toast.error(t('detail.badFileType'))
      } else {
        uploadMutation.mutate(file)
      }
    }
    e.target.value = ''
  }

  const onDownload = async (doc: ChildDocument) => {
    try {
      const res = await childrenApi.downloadDocument(childId, doc.id)
      downloadBlob(res.data, doc.filename)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {canWrite && (
        <div className="rounded-md border border-dashed border-border p-6 text-center">
          <FileUp className="mx-auto mb-2 size-6 text-muted-foreground" />
          <Label htmlFor="document" className="cursor-pointer text-sm font-medium text-primary">
            {t('detail.addDocument')}
          </Label>
          <input
            ref={fileInputRef}
            id="document"
            type="file"
            accept={ACCEPT_DOCUMENT}
            className="hidden"
            onChange={onFileSelected}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t('detail.documentHint', { max: DOCUMENT_MAX_MB })}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <FileUp className="mr-1.5 size-4" />}
            {t('detail.chooseFile')}
          </Button>
        </div>
        )}

        {child.documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('detail.noDocument')}</p>
        ) : (
          <ul className="space-y-2">
            {child.documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{doc.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(doc.size_bytes)} · {formatDate(doc.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button type="button" variant="outline" size="sm" onClick={() => onDownload(doc)}>
                    <Download className="mr-1.5 size-3.5" />
                    {t('detail.download')}
                  </Button>
                  {canWrite && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('detail.deleteDoc', { name: doc.filename })}
                    onClick={() => setDocToDelete(doc)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <ConfirmDialog
          open={!!docToDelete}
          onOpenChange={(open) => !open && setDocToDelete(null)}
          title={t('detail.deleteDocTitle')}
          description={t('detail.deleteDocBody', { name: docToDelete?.filename ?? '' })}
          confirmLabel={t('detail.delete')}
          destructive
          onConfirm={() => {
            if (docToDelete) removeMutation.mutate(docToDelete.id)
            setDocToDelete(null)
          }}
        />
      </CardContent>
    </Card>
  )
}
