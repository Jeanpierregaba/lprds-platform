'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Building, Clock, Globe, Loader2, Search, ShieldOff, Trash2, UserRound } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { attendanceApi } from '@/lib/api/attendance.api'
import { organizationApi } from '@/lib/api/organization.api'
import { staffApi } from '@/lib/api/staff.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import type { Department } from '@/types/organization'
import type { StaffListItem } from '@/types/staff'
import type { AttendanceSettingsPayload } from '@/types/attendance'

const toInputTime = (t: string | null | undefined) => (t ?? '').slice(0, 5)
const toApiTime = (t: string) => (t.length > 5 ? t : `${t}:00`)

export function SettingsTab() {
  const t = useTranslations('attendance')
  return (
    <div className="pt-2">
      <Tabs defaultValue="general">
        <PillsTabsList>
          <PillsTrigger value="general" active="primary" icon={Globe}>
            {t('settings.tabs.general')}
          </PillsTrigger>
          <PillsTrigger value="departments" active="teal" icon={Building}>
            {t('settings.tabs.departments')}
          </PillsTrigger>
          <PillsTrigger value="staff" active="sky" icon={Clock}>
            {t('settings.tabs.staff')}
          </PillsTrigger>
          <PillsTrigger value="exemptions" active="navy" icon={ShieldOff}>
            {t('settings.tabs.exemptions')}
          </PillsTrigger>
        </PillsTabsList>
        <TabPanel value="general">
          <GeneralSettings />
        </TabPanel>
        <TabPanel value="departments">
          <DepartmentSettings />
        </TabPanel>
        <TabPanel value="staff">
          <StaffSchedulesSettings />
        </TabPanel>
        <TabPanel value="exemptions">
          <ExemptionsSettings />
        </TabPanel>
      </Tabs>
    </div>
  )
}

/** Signature minimale d'un traducteur next-intl. */
type T = (key: string) => string

const makeGeneralSchema = (t: T) => z.object({
  timezone: z.string().min(1, t('validation.timezoneRequired')).max(50),
  staff_expected_arrival_time: z.string().min(1, t('validation.timeRequired')),
  staff_expected_departure_time: z.string().min(1, t('validation.timeRequired')),
  late_grace_minutes: z.number().int().min(0, t('validation.graceMin')).max(120, t('validation.graceMax')),
})
type GeneralForm = z.infer<ReturnType<typeof makeGeneralSchema>>

function GeneralSettings() {
  const t = useTranslations('attendance')
  const queryClient = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['attendance', 'settings', 'general'],
    queryFn: async () => {
      const res = await attendanceApi.getGeneralSettings()
      return res.status === 200 ? res.data : null
    },
  })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<GeneralForm>({
    resolver: zodResolver(makeGeneralSchema(t)),
    defaultValues: { timezone: 'UTC', staff_expected_arrival_time: '', staff_expected_departure_time: '', late_grace_minutes: 0 },
    values: settings
      ? {
          timezone: settings.timezone,
          staff_expected_arrival_time: toInputTime(settings.staff_expected_arrival_time),
          staff_expected_departure_time: toInputTime(settings.staff_expected_departure_time),
          late_grace_minutes: settings.late_grace_minutes ?? 0,
        }
      : undefined,
  })

  const onSubmit = async (values: GeneralForm) => {
    try {
      await attendanceApi.setGeneralSettings({
        timezone: values.timezone,
        staff_expected_arrival_time: toApiTime(values.staff_expected_arrival_time),
        staff_expected_departure_time: toApiTime(values.staff_expected_departure_time),
        late_grace_minutes: values.late_grace_minutes,
      })
      toast.success(t('settings.generalSaved'))
      queryClient.invalidateQueries({ queryKey: ['attendance', 'settings', 'general'] })
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      reset(undefined, { keepValues: true })
    }
  }

  if (isLoading) {
    return <Skeleton className="mt-2 h-64 w-full max-w-md" />
  }

  return (
    <Card className="mt-2 max-w-md">
      <CardHeader>
        <CardTitle className="text-base">{t('settings.generalTitle')}</CardTitle>
        <CardDescription>
          {t('settings.generalHint')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="timezone">{t('settings.timezone')}</Label>
            <Input id="timezone" placeholder="Africa/Porto-Novo" {...register('timezone')} aria-invalid={!!errors.timezone} />
            {errors.timezone && <p className="text-sm text-destructive">{errors.timezone.message}</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="staff_expected_arrival_time">{t('settings.arrival')}</Label>
              <Input
                id="staff_expected_arrival_time" type="time"
                {...register('staff_expected_arrival_time')}
                aria-invalid={!!errors.staff_expected_arrival_time}
              />
              {errors.staff_expected_arrival_time && (
                <p className="text-sm text-destructive">{errors.staff_expected_arrival_time.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff_expected_departure_time">{t('settings.departure')}</Label>
              <Input
                id="staff_expected_departure_time" type="time"
                {...register('staff_expected_departure_time')}
                aria-invalid={!!errors.staff_expected_departure_time}
              />
              {errors.staff_expected_departure_time && (
                <p className="text-sm text-destructive">{errors.staff_expected_departure_time.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="late_grace_minutes">{t('settings.grace')}</Label>
            <Input
              id="late_grace_minutes" type="number" min={0} max={120}
              {...register('late_grace_minutes', { valueAsNumber: true })}
              aria-invalid={!!errors.late_grace_minutes}
            />
            {errors.late_grace_minutes && (
              <p className="text-sm text-destructive">{errors.late_grace_minutes.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Une arrivée dans ce délai après l&apos;horaire attendu compte « présent ».
              0 = aucun pardon. S&apos;applique aux enfants comme au personnel.
            </p>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="mr-2 size-4 animate-spin" /> {t('settings.saving')}</> : t('settings.save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

const makeDepartmentSchema = (t: T) => z.object({
  expected_arrival_time: z.string().min(1, t('validation.timeRequired')),
  expected_departure_time: z.string().min(1, t('validation.timeRequired')),
})
type DepartmentForm = z.infer<ReturnType<typeof makeDepartmentSchema>>

function DepartmentSettings() {
  const t = useTranslations('attendance')
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Department | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: departments, isLoading: isLoadingDepartments } = useQuery({
    queryKey: ['departments', { includeInactive: false }],
    queryFn: () => organizationApi.listDepartments(false).then((r) => r.data),
  })

  const settingsQueries = useQueries({
    queries: (departments ?? []).map((d) => ({
      queryKey: ['attendance', 'settings', 'department', d.id],
      queryFn: async () => {
        const res = await attendanceApi.getDepartmentSettings(d.id)
        return res.status === 200 ? res.data : null
      },
      enabled: !!departments,
    })),
  })

  const settingsByDept = new Map(
    (departments ?? []).map((d, i) => [d.id, settingsQueries[i]?.data ?? null])
  )
  const isLoadingSettings = settingsQueries.some((q) => q.isLoading)

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<DepartmentForm>({
    resolver: zodResolver(makeDepartmentSchema(t)),
  })

  const openEdit = (dept: Department) => {
    setEditing(dept)
    const current = settingsByDept.get(dept.id)
    reset({
      expected_arrival_time: current ? toInputTime(current.expected_arrival_time) : '',
      expected_departure_time: current ? toInputTime(current.expected_departure_time) : '',
    })
    setDialogOpen(true)
  }

  const onSubmit = async (values: DepartmentForm) => {
    if (!editing) return
    try {
      await attendanceApi.setDepartmentSettings(editing.id, {
        expected_arrival_time: toApiTime(values.expected_arrival_time),
        expected_departure_time: toApiTime(values.expected_departure_time),
      })
      toast.success(t('settings.schedulesSaved'))
      setDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ['attendance', 'settings', 'department', editing.id] })
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <div className="mt-2 space-y-4">
      <p className="text-sm text-white font-semibold">
        {t('settings.departmentsHint')}
      </p>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('settings.department')}</TableHead>
                <TableHead>{t('settings.arrival')}</TableHead>
                <TableHead>{t('settings.departure')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingDepartments ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : departments?.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                    {t('settings.noDepartment')}
                  </TableCell>
                </TableRow>
              ) : (
                departments?.map((dept) => {
                  const current = settingsByDept.get(dept.id)
                  return (
                    <TableRow key={dept.id}>
                      <TableCell className="font-medium">{dept.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {isLoadingSettings ? <Skeleton className="h-4 w-16" /> : current ? toInputTime(current.expected_arrival_time) : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {isLoadingSettings ? <Skeleton className="h-4 w-16" /> : current ? toInputTime(current.expected_departure_time) : '—'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(dept)}>
                          {current ? t('settings.edit') : t('settings.configure')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.deptDialogTitle', { name: editing?.name ?? '' })}</DialogTitle>
            <DialogDescription>{t('settings.deptDialogHint')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expected_arrival_time">{t('settings.arrival')}</Label>
                <Input id="expected_arrival_time" type="time" {...register('expected_arrival_time')} aria-invalid={!!errors.expected_arrival_time} />
                {errors.expected_arrival_time && <p className="text-sm text-destructive">{errors.expected_arrival_time.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="expected_departure_time">{t('settings.departure')}</Label>
                <Input id="expected_departure_time" type="time" {...register('expected_departure_time')} aria-invalid={!!errors.expected_departure_time} />
                {errors.expected_departure_time && <p className="text-sm text-destructive">{errors.expected_departure_time.message}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 size-4 animate-spin" /> {t('settings.saving')}</> : t('settings.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const makeScheduleSchema = (t: T) => z.object({
  expected_arrival_time: z.string().min(1, t('validation.timeRequired')),
  expected_departure_time: z.string().min(1, t('validation.timeRequired')),
})
type ScheduleForm = z.infer<ReturnType<typeof makeScheduleSchema>>

function StaffSchedulesSettings() {
  const t = useTranslations('attendance')
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [editing, setEditing] = useState<StaffListItem | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data: staffResults, isLoading } = useQuery({
    queryKey: ['staff', { search: debouncedSearch, forSchedules: true }],
    queryFn: () => staffApi.list({ search: debouncedSearch || undefined, include_inactive: false, limit: 200 }).then((r) => r.data),
  })

  const staffItems = staffResults?.items ?? []

  const scheduleQueries = useQueries({
    queries: staffItems.map((s) => ({
      queryKey: ['attendance', 'settings', 'staff', s.id],
      queryFn: async () => {
        const res = await attendanceApi.getStaffSchedule(s.id)
        return res.status === 200 ? res.data : null
      },
    })),
  })

  const scheduleByStaff = new Map(
    staffItems.map((s, i) => [s.id, scheduleQueries[i]?.data ?? null])
  )

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ScheduleForm>({
    resolver: zodResolver(makeScheduleSchema(t)),
  })

  const saveMutation = useMutation({
    mutationFn: ({ staffId, data }: { staffId: string; data: AttendanceSettingsPayload }) =>
      attendanceApi.setStaffSchedule(staffId, data),
    onSuccess: (_data, vars) => {
      toast.success(t('settings.customSaved'))
      setDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ['attendance', 'settings', 'staff', vars.staffId] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (staffId: string) => attendanceApi.deleteStaffSchedule(staffId),
    onSuccess: (_data, staffId) => {
      toast.success(t('settings.generalRestored'))
      setDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ['attendance', 'settings', 'staff', staffId] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const openEdit = (s: StaffListItem) => {
    setEditing(s)
    setDialogOpen(true)
  }

  // Pré-remplit à l'ouverture, une fois l'horaire chargé — jamais avec du
  // vide pendant le chargement (écraserait un horaire existant à l'écran).
  const editingSchedule = editing ? scheduleByStaff.get(editing.id) : undefined
  const editingScheduleLoading = editing
    ? scheduleQueries[staffItems.findIndex((s) => s.id === editing.id)]?.isLoading ?? false
    : false
  useEffect(() => {
    if (dialogOpen && editing && !editingScheduleLoading) {
      reset({
        expected_arrival_time: editingSchedule ? toInputTime(editingSchedule.expected_arrival_time) : '',
        expected_departure_time: editingSchedule ? toInputTime(editingSchedule.expected_departure_time) : '',
      })
    }
  }, [dialogOpen, editing, editingSchedule, editingScheduleLoading, reset])

  const onSubmit = (values: ScheduleForm) => {
    if (!editing) return
    saveMutation.mutate({
      staffId: editing.id,
      data: {
        expected_arrival_time: toApiTime(values.expected_arrival_time),
        expected_departure_time: toApiTime(values.expected_departure_time),
      },
    })
  }

  return (
    <div className="mt-2 space-y-4">
      <p className="text-sm text-white font-semibold">
        Par défaut, tout le personnel suit l&apos;horaire général (cf. Général). Posez un horaire
        personnalisé ici pour un membre — il surcharge l&apos;horaire général pour le calcul des retards.
      </p>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('settings.searchStaff')}
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('settings.staffColumn')}</TableHead>
                <TableHead>{t('settings.email')}</TableHead>
                <TableHead>{t('settings.schedule')}</TableHead>
                <TableHead className="w-32">{t('settings.arrivalShort')}</TableHead>
                <TableHead className="w-32">{t('settings.departureShort')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : staffItems.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <UserRound className="size-5" />
                      </div>
                      <p>{debouncedSearch ? t('settings.noResult') : t('settings.searchPrompt')}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                staffItems.map((s) => {
                  const current = scheduleByStaff.get(s.id)
                  const currentLoading = scheduleQueries[staffItems.findIndex((x) => x.id === s.id)]?.isLoading ?? false
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {s.nickname || `${s.first_name} ${s.last_name}`}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{s.email}</TableCell>
                      <TableCell>
                        {currentLoading ? (
                          <Skeleton className="h-5 w-24 rounded-full" />
                        ) : current ? (
                          <Badge variant="outline" className="font-normal">{t('settings.custom')}</Badge>
                        ) : (
                          <Badge variant="secondary" className="font-normal">{t('settings.generalSchedule')}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {currentLoading ? <Skeleton className="h-4 w-16" /> : current ? toInputTime(current.expected_arrival_time) : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {currentLoading ? <Skeleton className="h-4 w-16" /> : current ? toInputTime(current.expected_departure_time) : '—'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                          {current ? t('settings.edit') : t('settings.customise')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('settings.staffDialogTitle', { name: editing ? (editing.nickname || `${editing.first_name} ${editing.last_name}`) : '' })}
            </DialogTitle>
            <DialogDescription>
              {t('settings.staffDialogHint')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expected_arrival_time">{t('settings.arrival')}</Label>
                <Input id="expected_arrival_time" type="time" {...register('expected_arrival_time')} aria-invalid={!!errors.expected_arrival_time} />
                {errors.expected_arrival_time && <p className="text-sm text-destructive">{errors.expected_arrival_time.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="expected_departure_time">{t('settings.departure')}</Label>
                <Input id="expected_departure_time" type="time" {...register('expected_departure_time')} aria-invalid={!!errors.expected_departure_time} />
                {errors.expected_departure_time && <p className="text-sm text-destructive">{errors.expected_departure_time.message}</p>}
              </div>
            </div>
            <DialogFooter className="justify-between">
              {editing && (editingSchedule || editingScheduleLoading) ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(editing.id)}
                >
                  <Trash2 className="mr-2 size-4" />
                  {t('settings.restoreGeneral')}
                </Button>
              ) : <div />}
              <Button type="submit" disabled={isSubmitting || saveMutation.isPending}>
                {(isSubmitting || saveMutation.isPending) ? (
                  <><Loader2 className="mr-2 size-4 animate-spin" /> Enregistrement...</>
                ) : t('settings.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ExemptionsSettings() {
  const t = useTranslations('attendance')
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data: staffResults, isLoading } = useQuery({
    queryKey: ['staff', { search: debouncedSearch, forExemptions: true }],
    queryFn: () => staffApi.list({ search: debouncedSearch || undefined, include_inactive: false, limit: 200 }).then((r) => r.data),
  })

  const { data: exemptions } = useQuery({
    queryKey: ['attendance', 'settings', 'exempt-staff'],
    queryFn: () => attendanceApi.listExemptions(false).then((r) => r.data),
  })

  const exemptSet = new Set((exemptions ?? []).filter((e) => e.exempt).map((e) => e.staff_id))

  const toggleMutation = useMutation({
    mutationFn: ({ staffId, exempt }: { staffId: string; exempt: boolean }) =>
      attendanceApi.setExemption(staffId, exempt),
    onSuccess: () => {
      toast.success(t('settings.exemptionSaved'))
      queryClient.invalidateQueries({ queryKey: ['attendance', 'settings', 'exempt-staff'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })
  // Pending par ligne : un seul toggle global bloquait les 50 switches et
  // les bascules rapides se perdaient.
  const pendingId = toggleMutation.isPending ? toggleMutation.variables?.staffId ?? null : null

  const items = staffResults?.items ?? []

  return (
    <div className="mt-2 space-y-4">
      <p className="text-sm text-white font-semibold">
        Un membre du personnel exempté n&apos;est jamais compté « absent » lorsqu&apos;il ne scanne pas.
      </p>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('settings.searchStaff')}
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('settings.staffColumn')}</TableHead>
                <TableHead>{t('settings.email')}</TableHead>
                <TableHead className="w-32">{t('settings.exempt')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-10" /></TableCell>
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={3} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <UserRound className="size-5" />
                      </div>
                      <p>{debouncedSearch ? t('settings.noResult') : t('settings.searchPrompt')}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((staff) => {
                  const exempt = exemptSet.has(staff.id)
                  return (
                    <TableRow key={staff.id}>
                      <TableCell className="font-medium">
                        {staff.nickname || `${staff.first_name} ${staff.last_name}`}
                        {exempt && <Badge variant="outline" className="ml-2 font-normal">{t('settings.exempt')}</Badge>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{staff.email}</TableCell>
                      <TableCell>
                        <Switch
                          checked={exempt}
                          onCheckedChange={(v) => toggleMutation.mutate({ staffId: staff.id, exempt: v })}
                          disabled={pendingId === staff.id}
                          aria-label={t('settings.exemptAria', { name: `${staff.nickname || staff.first_name} ${staff.last_name}` })}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
