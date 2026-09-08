'use client'

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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { attendanceApi } from '@/lib/api/attendance.api'
import { organizationApi } from '@/lib/api/organization.api'
import { staffApi } from '@/lib/api/staff.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import type { Department } from '@/types/organization'
import type { StaffListItem } from '@/types/staff'
import type { AttendanceSettingsPayload } from '@/types/attendance'

const toInputTime = (t: string) => t.slice(0, 5)
const toApiTime = (t: string) => `${t}:00`

export function SettingsTab() {
  return (
    <div className="pt-2">
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">
            <Globe className="mr-1.5 size-4" />
            Général
          </TabsTrigger>
          <TabsTrigger value="departments">
            <Building className="mr-1.5 size-4" />
            Départements
          </TabsTrigger>
          <TabsTrigger value="staff">
            <Clock className="mr-1.5 size-4" />
            Personnel
          </TabsTrigger>
          <TabsTrigger value="exemptions">
            <ShieldOff className="mr-1.5 size-4" />
            Exemptions
          </TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralSettings />
        </TabsContent>
        <TabsContent value="departments">
          <DepartmentSettings />
        </TabsContent>
        <TabsContent value="staff">
          <StaffSchedulesSettings />
        </TabsContent>
        <TabsContent value="exemptions">
          <ExemptionsSettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}

const generalSchema = z.object({
  timezone: z.string().min(1, 'Fuseau horaire requis').max(50),
  staff_expected_arrival_time: z.string().min(1, 'Heure requise'),
  staff_expected_departure_time: z.string().min(1, 'Heure requise'),
})
type GeneralForm = z.infer<typeof generalSchema>

function GeneralSettings() {
  const queryClient = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['attendance', 'settings', 'general'],
    queryFn: async () => {
      const res = await attendanceApi.getGeneralSettings()
      return res.status === 200 ? res.data : null
    },
  })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<GeneralForm>({
    resolver: zodResolver(generalSchema),
    defaultValues: { timezone: 'UTC', staff_expected_arrival_time: '', staff_expected_departure_time: '' },
    values: settings
      ? {
          timezone: settings.timezone,
          staff_expected_arrival_time: toInputTime(settings.staff_expected_arrival_time),
          staff_expected_departure_time: toInputTime(settings.staff_expected_departure_time),
        }
      : undefined,
  })

  const onSubmit = async (values: GeneralForm) => {
    try {
      await attendanceApi.setGeneralSettings({
        timezone: values.timezone,
        staff_expected_arrival_time: toApiTime(values.staff_expected_arrival_time),
        staff_expected_departure_time: toApiTime(values.staff_expected_departure_time),
      })
      toast.success('Paramètres généraux enregistrés.')
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
        <CardTitle className="text-base">Fuseau horaire &amp; horaires du personnel</CardTitle>
        <CardDescription>
          Un seul horaire pour tout le personnel de l&apos;établissement — les enfants sont configurés par département.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="timezone">Fuseau horaire (IANA)</Label>
            <Input id="timezone" placeholder="Africa/Porto-Novo" {...register('timezone')} aria-invalid={!!errors.timezone} />
            {errors.timezone && <p className="text-sm text-destructive">{errors.timezone.message}</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="staff_expected_arrival_time">Arrivée attendue</Label>
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
              <Label htmlFor="staff_expected_departure_time">Départ attendu</Label>
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
          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="mr-2 size-4 animate-spin" /> Enregistrement...</> : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

const departmentSchema = z.object({
  expected_arrival_time: z.string().min(1, 'Heure requise'),
  expected_departure_time: z.string().min(1, 'Heure requise'),
})
type DepartmentForm = z.infer<typeof departmentSchema>

function DepartmentSettings() {
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
    resolver: zodResolver(departmentSchema),
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
      toast.success('Horaires enregistrés.')
      setDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ['attendance', 'settings', 'department', editing.id] })
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  return (
    <div className="mt-2 space-y-4">
      <p className="text-sm text-white font-semibold">
        Horaires attendus pour les enfants — configurables par département (le personnel a un horaire unique, cf. Général).
      </p>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Département</TableHead>
                <TableHead>Arrivée attendue</TableHead>
                <TableHead>Départ attendu</TableHead>
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
                    Aucun département. Créez-en depuis Organisation.
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
                          {current ? 'Modifier' : 'Configurer'}
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
            <DialogTitle>Horaires — {editing?.name}</DialogTitle>
            <DialogDescription>Utilisés pour calculer les retards des enfants de ce département.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expected_arrival_time">Arrivée attendue</Label>
                <Input id="expected_arrival_time" type="time" {...register('expected_arrival_time')} aria-invalid={!!errors.expected_arrival_time} />
                {errors.expected_arrival_time && <p className="text-sm text-destructive">{errors.expected_arrival_time.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="expected_departure_time">Départ attendu</Label>
                <Input id="expected_departure_time" type="time" {...register('expected_departure_time')} aria-invalid={!!errors.expected_departure_time} />
                {errors.expected_departure_time && <p className="text-sm text-destructive">{errors.expected_departure_time.message}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 size-4 animate-spin" /> Enregistrement...</> : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const scheduleSchema = z.object({
  expected_arrival_time: z.string().min(1, 'Heure requise'),
  expected_departure_time: z.string().min(1, 'Heure requise'),
})
type ScheduleForm = z.infer<typeof scheduleSchema>

function StaffSchedulesSettings() {
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
    queryFn: () => staffApi.list({ search: debouncedSearch || undefined, include_inactive: false, limit: 50 }).then((r) => r.data),
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
    resolver: zodResolver(scheduleSchema),
  })

  const saveMutation = useMutation({
    mutationFn: ({ staffId, data }: { staffId: string; data: AttendanceSettingsPayload }) =>
      attendanceApi.setStaffSchedule(staffId, data),
    onSuccess: (_data, vars) => {
      toast.success('Horaire personnalisé enregistré.')
      setDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ['attendance', 'settings', 'staff', vars.staffId] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (staffId: string) => attendanceApi.deleteStaffSchedule(staffId),
    onSuccess: (_data, staffId) => {
      toast.success('Horaire général rétabli.')
      setDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ['attendance', 'settings', 'staff', staffId] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const openEdit = (s: StaffListItem) => {
    setEditing(s)
    const current = scheduleByStaff.get(s.id)
    reset({
      expected_arrival_time: current ? toInputTime(current.expected_arrival_time) : '',
      expected_departure_time: current ? toInputTime(current.expected_departure_time) : '',
    })
    setDialogOpen(true)
  }

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
          placeholder="Rechercher un membre du personnel..."
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
                <TableHead>Personnel</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Horaire</TableHead>
                <TableHead className="w-32">Arrivée</TableHead>
                <TableHead className="w-32">Départ</TableHead>
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
                      <p>{debouncedSearch ? 'Aucun résultat.' : 'Recherchez un membre du personnel.'}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                staffItems.map((s) => {
                  const current = scheduleByStaff.get(s.id)
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {s.nickname || `${s.first_name} ${s.last_name}`}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{s.email}</TableCell>
                      <TableCell>
                        {current ? (
                          <Badge variant="outline" className="font-normal">Personnalisé</Badge>
                        ) : (
                          <Badge variant="secondary" className="font-normal">Horaire général</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {current ? toInputTime(current.expected_arrival_time) : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {current ? toInputTime(current.expected_departure_time) : '—'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                          {current ? 'Modifier' : 'Personnaliser'}
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
              Horaire — {editing ? (editing.nickname || `${editing.first_name} ${editing.last_name}`) : ''}
            </DialogTitle>
            <DialogDescription>
              Surcharge l&apos;horaire général pour ce membre du personnel. Rétablissez l&apos;horaire
              général pour le faire retomber sur le défaut.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expected_arrival_time">Arrivée attendue</Label>
                <Input id="expected_arrival_time" type="time" {...register('expected_arrival_time')} aria-invalid={!!errors.expected_arrival_time} />
                {errors.expected_arrival_time && <p className="text-sm text-destructive">{errors.expected_arrival_time.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="expected_departure_time">Départ attendu</Label>
                <Input id="expected_departure_time" type="time" {...register('expected_departure_time')} aria-invalid={!!errors.expected_departure_time} />
                {errors.expected_departure_time && <p className="text-sm text-destructive">{errors.expected_departure_time.message}</p>}
              </div>
            </div>
            <DialogFooter className="justify-between">
              {editing && scheduleByStaff.get(editing.id) ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(editing.id)}
                >
                  <Trash2 className="mr-2 size-4" />
                  Rétablir l&apos;horaire général
                </Button>
              ) : <div />}
              <Button type="submit" disabled={isSubmitting || saveMutation.isPending}>
                {(isSubmitting || saveMutation.isPending) ? (
                  <><Loader2 className="mr-2 size-4 animate-spin" /> Enregistrement...</>
                ) : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ExemptionsSettings() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data: staffResults, isLoading } = useQuery({
    queryKey: ['staff', { search: debouncedSearch, forExemptions: true }],
    queryFn: () => staffApi.list({ search: debouncedSearch || undefined, include_inactive: false, limit: 50 }).then((r) => r.data),
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
      toast.success('Exemption mise à jour.')
      queryClient.invalidateQueries({ queryKey: ['attendance', 'settings', 'exempt-staff'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const items = staffResults?.items ?? []

  return (
    <div className="mt-2 space-y-4">
      <p className="text-sm text-white font-semibold">
        Un membre du personnel exempté n&apos;est jamais compté « absent » lorsqu&apos;il ne scanne pas.
      </p>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher un membre du personnel..."
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
                <TableHead>Personnel</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-32">Exempté</TableHead>
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
                      <p>{debouncedSearch ? 'Aucun résultat.' : 'Recherchez un membre du personnel.'}</p>
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
                        {exempt && <Badge variant="outline" className="ml-2 font-normal">Exempté</Badge>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{staff.email}</TableCell>
                      <TableCell>
                        <Switch
                          checked={exempt}
                          onCheckedChange={(v) => toggleMutation.mutate({ staffId: staff.id, exempt: v })}
                          disabled={toggleMutation.isPending}
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
