'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { useLabelMap } from '@/lib/i18n/labels'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { KeyRound, Loader2, ShieldCheck, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { staffApi } from '@/lib/api/staff.api'
import { rbacApi } from '@/lib/api/rbac.api'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { BackLink, PageMotion } from '@/components/dashboard/shared/page'
import { DetailSkeleton, StatusPill } from '@/components/dashboard/shared/cards'
import { ConfirmDialog } from '@/components/dashboard/shared/dialogs'
import { STAFF_TYPES, type StaffType } from '@/types/staff'
import { passwordField } from '@/lib/validation/password'

type T = (key: string) => string

const makeInfoSchema = (t: T) => z.object({
  first_name: z.string().min(1, t('validation.firstName')).max(100),
  last_name:  z.string().min(1, t('validation.lastName')).max(100),
  nickname:   z.string().min(1, t('validation.nickname')).max(100),
  phone:      z.string().min(1, t('validation.phone')).max(20),
  email:      z.string().email(t('validation.email')),
  staff_type: z.string().min(1, t('validation.staffType')),
})
type InfoForm = z.infer<ReturnType<typeof makeInfoSchema>>

const makeResetSchema = (t: T, tAuth: T) => z.object({
  new_password: passwordField(tAuth),
})
type ResetForm = z.infer<ReturnType<typeof makeResetSchema>>

export default function StaffDetailPage() {
  const t = useTranslations('staff')
  const tCommon = useTranslations('common')
  const tAuth = useTranslations('auth')
  const staffTypesLabels = useLabelMap('staffTypes', STAFF_TYPES)
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [resetOpen, setResetOpen] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('staff:write')

  const { data: staff, isLoading } = useQuery({
    queryKey: ['staff', id],
    queryFn: () => staffApi.get(id).then((r) => r.data),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['staff', id] })

  const {
    register: registerInfo,
    handleSubmit: handleInfoSubmit,
    control,
    formState: { errors: infoErrors, isSubmitting: isSavingInfo },
    reset: resetInfoForm,
  } = useForm<InfoForm>({
    resolver: zodResolver(makeInfoSchema(t)),
    defaultValues: { first_name: '', last_name: '', nickname: '', phone: '', email: '', staff_type: '' },
    values: staff
      ? {
          first_name: staff.first_name, last_name: staff.last_name, nickname: staff.nickname ?? '',
          phone: staff.phone ?? '', email: staff.email, staff_type: staff.staff_type ?? '',
        }
      : undefined,
  })

  const onSaveInfo = async (values: InfoForm) => {
    try {
      await staffApi.update(id, { ...values, staff_type: values.staff_type as StaffType })
      toast.success(t('form.updated'))
      invalidate()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  const toggleActiveMutation = useMutation({
    mutationFn: () => staffApi.setStatus(id, !staff?.is_active),
    onSuccess: () => {
      toast.success(staff?.is_active ? t('status.deactivated') : t('status.reactivated'))
      invalidate()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const {
    register: registerReset,
    handleSubmit: handleResetSubmit,
    formState: { errors: resetErrors, isSubmitting: isResetting },
    reset: resetResetForm,
  } = useForm<ResetForm>({ resolver: zodResolver(makeResetSchema(t, tAuth)) })

  const onResetPassword = async (values: ResetForm) => {
    try {
      await staffApi.resetPassword(id, values.new_password)
      toast.success(t('form.resetDone'))
      resetResetForm()
      setResetOpen(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  if (isLoading) {
    return <DetailSkeleton />
  }

  if (!staff) {
    return <p className="text-muted-foreground">{t('detail.notFound')}</p>
  }

  return (
    <PageMotion className="max-w-3xl space-y-4">
      <BackLink href="/dashboard/admin/staff" label={t('form.back')} />

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{staff.nickname || `${staff.first_name} ${staff.last_name}`}</h1>
            <StatusPill active={staff.is_active} />
          </div>
          <p className="font-mono text-sm text-white font-semibold">{staff.matricule ?? '—'}</p>
        </div>

{canWrite && (
        <div className="flex items-center gap-2">
          <Dialog open={resetOpen} onOpenChange={setResetOpen}>
            <DialogTrigger render={<Button variant="outline" />}>
              <KeyRound className="mr-1.5 size-4" />
              {t('form.resetPassword')}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('form.resetPassword')}</DialogTitle>
                <DialogDescription>{t('resetHintStaff')}</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleResetSubmit(onResetPassword)} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="new_password">{t('fields.newPassword')}</Label>
                  <Input id="new_password" type="password" {...registerReset('new_password')} aria-invalid={!!resetErrors.new_password} />
                  {resetErrors.new_password && <p className="text-sm text-destructive">{resetErrors.new_password.message}</p>}
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isResetting}>
                    {isResetting ? <><Loader2 className="mr-2 size-4 animate-spin" /> {t('form.sending')}</> : t('form.reset')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Button variant={staff.is_active ? 'destructive' : 'outline'} onClick={() => setConfirmArchive(true)}>
            {staff.is_active ? t('status.deactivate') : t('status.reactivate')}
          </Button>
          <ConfirmDialog
            open={confirmArchive}
            onOpenChange={setConfirmArchive}
            title={staff.is_active ? t('status.confirmTitle') : t('status.reactivateTitle')}
            description={
              staff.is_active
                ? t('status.deactivateBody')
                : t('status.reactivateBody')
            }
            confirmLabel={t('status.confirm')}
            onConfirm={() => {
              setConfirmArchive(false)
              toggleActiveMutation.mutate()
            }}
          />
        </div>
        )}
      </div>

      <Tabs defaultValue="infos">
        <TabsList>
          <TabsTrigger value="infos">{t('tabs.infos')}</TabsTrigger>
          {user?.role === 'admin' && (
          <TabsTrigger value="roles">{t('tabs.roles')}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="infos">
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleInfoSubmit(onSaveInfo)} className="space-y-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">{t('fields.firstName')}</Label>
                    <Input id="first_name" {...registerInfo('first_name')} aria-invalid={!!infoErrors.first_name} />
                    {infoErrors.first_name && <p className="text-sm text-destructive">{infoErrors.first_name.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last_name">{t('fields.lastName')}</Label>
                    <Input id="last_name" {...registerInfo('last_name')} aria-invalid={!!infoErrors.last_name} />
                    {infoErrors.last_name && <p className="text-sm text-destructive">{infoErrors.last_name.message}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nickname">{t('fields.nickname')}</Label>
                  <Input id="nickname" {...registerInfo('nickname')} aria-invalid={!!infoErrors.nickname} />
                  {infoErrors.nickname && <p className="text-sm text-destructive">{infoErrors.nickname.message}</p>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('fields.email')}</Label>
                    <Input id="email" type="email" {...registerInfo('email')} aria-invalid={!!infoErrors.email} />
                    {infoErrors.email && <p className="text-sm text-destructive">{infoErrors.email.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t('fields.phone')}</Label>
                    <Input id="phone" {...registerInfo('phone')} aria-invalid={!!infoErrors.phone} />
                    {infoErrors.phone && <p className="text-sm text-destructive">{infoErrors.phone.message}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="staff_type">{t('fields.staffType')}</Label>
                  <Controller
                    control={control}
                    name="staff_type"
                    render={({ field }) => (
                      <Select items={staffTypesLabels} value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="staff_type" className="w-full" aria-invalid={!!infoErrors.staff_type}>
                          <SelectValue placeholder={t('fields.chooseType')} />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(staffTypesLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {infoErrors.staff_type && <p className="text-sm text-destructive">{infoErrors.staff_type.message}</p>}
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => resetInfoForm()}>
                    {tCommon('actions.cancel')}
                  </Button>
                  {canWrite && (
                  <Button type="submit" disabled={isSavingInfo}>
                    {isSavingInfo ? <><Loader2 className="mr-2 size-4 animate-spin" /> {tCommon('states.saving')}</> : tCommon('actions.save')}
                  </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {user?.role === 'admin' && (
        <TabsContent value="roles">
          <StaffRolesCard staffId={id} />
        </TabsContent>
        )}
      </Tabs>
    </PageMotion>
  )
}

function StaffRolesCard({ staffId }: { staffId: string }) {
  const t = useTranslations('staff')
  const queryClient = useQueryClient()

  const { data: roles } = useQuery({
    queryKey: ['roles', { includeInactive: false }],
    queryFn: () => rbacApi.listRoles(false).then((r) => r.data),
  })

  const { data: userRoles, isLoading } = useQuery({
    queryKey: ['user-roles', staffId],
    queryFn: () => rbacApi.getUserRoles(staffId).then((r) => r.data),
  })

  const invalidateUserRoles = () => queryClient.invalidateQueries({ queryKey: ['user-roles', staffId] })

  const assignMutation = useMutation({
    mutationFn: (roleId: string) => rbacApi.assignRole(staffId, roleId),
    onSuccess: () => {
      toast.success(t('roles.assigned'))
      invalidateUserRoles()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const revokeMutation = useMutation({
    mutationFn: (roleId: string) => rbacApi.revokeRole(staffId, roleId),
    onSuccess: () => {
      toast.success(t('roles.revoked'))
      invalidateUserRoles()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const assignedRoleIds = new Set(userRoles?.roles.map((r) => r.id) ?? [])
  const availableRoles = roles?.filter((r) => !assignedRoleIds.has(r.id)) ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('roles.title')}</CardTitle>
        <CardDescription>{t('roles.hint')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {userRoles?.roles.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('roles.none')}</p>
              ) : (
                userRoles?.roles.map((role) => (
                  <div key={role.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span className="text-sm font-medium">{role.name}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('roles.revoke', { name: role.name })}
                      onClick={() => revokeMutation.mutate(role.id)}
                      disabled={revokeMutation.isPending}
                    >
                      <X className="size-4 text-destructive" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            {availableRoles.length > 0 ? (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">{t('roles.assign')}</p>
                <div className="flex flex-wrap gap-2">
                  {availableRoles.map((role) => (
                    <Button
                      key={role.id}
                      variant="outline"
                      size="sm"
                      onClick={() => assignMutation.mutate(role.id)}
                      disabled={assignMutation.isPending}
                    >
                      {assignMutation.isPending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                      {role.name}
                    </Button>
                  ))}
                </div>
              </div>
            ) : roles?.length === 0 ? (
              <div className="flex flex-col items-center gap-2 border-t border-border py-6 pt-6 text-center text-muted-foreground">
                <ShieldCheck className="size-6" />
                <p className="text-sm">{t('noRoleYet')}</p>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
