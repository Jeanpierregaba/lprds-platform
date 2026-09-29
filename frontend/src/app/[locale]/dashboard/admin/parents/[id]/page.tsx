'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useState } from 'react'
import { intlLocale } from '@/lib/utils/locale-format'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { KeyRound, Loader2, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { parentsApi } from '@/lib/api/parents.api'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { BackLink, PageMotion } from '@/components/dashboard/shared/page'
import { DetailSkeleton, StatusPill } from '@/components/dashboard/shared/cards'
import { ConfirmDialog } from '@/components/dashboard/shared/dialogs'
import { ChildMultiSelect } from '../child-multiselect'
import type { ParentChildBrief } from '@/types/parents'

type T = (key: string) => string

const makeInfoSchema = (t: T) => z.object({
  first_name: z.string().min(1, t('validation.firstName')).max(100),
  last_name:  z.string().min(1, t('validation.lastName')).max(100),
  nickname:   z.string().min(1, t('validation.nickname')).max(100),
  phone:      z.string().min(1, t('validation.phone')).max(20),
  email:      z.string().email(t('validation.email')),
})
type InfoForm = z.infer<ReturnType<typeof makeInfoSchema>>

const makeResetSchema = (t: T) => z.object({
  new_password: z.string()
    .min(8, t('validation.passwordMin'))
    .regex(/[A-Z]/, 'Une majuscule requise')
    .regex(/[0-9]/, 'Un chiffre requis'),
})
type ResetForm = z.infer<ReturnType<typeof makeResetSchema>>

function formatDateTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

export default function ParentDetailPage() {
  const t = useTranslations('parents')
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('parents:write')
  const [resetOpen, setResetOpen] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [children, setChildren] = useState<ParentChildBrief[]>([])
  const [childrenError, setChildrenError] = useState<string | null>(null)

  const { data: parent, isLoading } = useQuery({
    queryKey: ['parents', id],
    queryFn: () => parentsApi.get(id).then((r) => r.data),
  })

  useEffect(() => {
    if (parent) setChildren(parent.assigned_children)
  }, [parent?.id])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['parents', id] })

  const {
    register: registerInfo,
    handleSubmit: handleInfoSubmit,
    formState: { errors: infoErrors, isSubmitting: isSavingInfo },
    reset: resetInfoForm,
  } = useForm<InfoForm>({
    resolver: zodResolver(makeInfoSchema(t)),
    values: parent
      ? {
          first_name: parent.first_name, last_name: parent.last_name, nickname: parent.nickname ?? '',
          phone: parent.phone ?? '', email: parent.email,
        }
      : undefined,
  })

  const onSaveInfo = async (values: InfoForm) => {
    if (children.length === 0) {
      setChildrenError(t('form.childRequired'))
      return
    }
    setChildrenError(null)
    try {
      await parentsApi.update(id, { ...values, child_ids: children.map((c) => c.id) })
      toast.success(t('form.updated'))
      invalidate()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  const toggleActiveMutation = useMutation({
    mutationFn: () => parentsApi.update(id, { is_active: !parent?.is_active }),
    onSuccess: () => {
      toast.success(parent?.is_active ? t('status.deactivated') : t('status.reactivated'))
      invalidate()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const {
    register: registerReset,
    handleSubmit: handleResetSubmit,
    formState: { errors: resetErrors, isSubmitting: isResetting },
    reset: resetResetForm,
  } = useForm<ResetForm>({ resolver: zodResolver(makeResetSchema(t)) })

  const onResetPassword = async (values: ResetForm) => {
    try {
      await parentsApi.resetPassword(id, values.new_password)
      toast.success(t('form.resetDone'))
      resetResetForm()
      setResetOpen(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  if (isLoading) {
    return <DetailSkeleton className="max-w-2xl space-y-4" />
  }

  if (!parent) {
    return <p className="text-muted-foreground">{t('form.notFound')}</p>
  }

  return (
    <PageMotion className="max-w-2xl space-y-4">
      <BackLink href="/dashboard/admin/parents" label={t('form.back')} />

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{parent.nickname || `${parent.first_name} ${parent.last_name}`}</h1>
            <StatusPill active={parent.is_active} />
          </div>
          <p className="text-sm text-white">
            Dernière connexion : {formatDateTime(parent.last_login_at)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canWrite && (
          <Dialog open={resetOpen} onOpenChange={setResetOpen}>
            <DialogTrigger render={<Button variant="outline" />}>
              <KeyRound className="mr-1.5 size-4" />
              {t('form.resetPassword')}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('form.resetPassword')}</DialogTitle>
                <DialogDescription>
                  Le nouveau mot de passe est envoyé par email au parent — il n&apos;a pas à le redéfinir.
                </DialogDescription>
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
          )}

          {canWrite && (
          <>
            <Button variant={parent.is_active ? 'destructive' : 'outline'} onClick={() => setConfirmArchive(true)}>
              <Trash2 className="mr-1.5 size-4 text-white" />
              {parent.is_active ? t('status.deactivate') : t('status.reactivate')}
            </Button>
            <ConfirmDialog
              open={confirmArchive}
              onOpenChange={setConfirmArchive}
              title={parent.is_active ? t('status.confirmTitle') : t('status.reactivateTitle')}
              description={
                parent.is_active
                  ? t('status.deactivateBody')
                  : t('status.reactivateBody')
              }
              confirmLabel={t('status.confirm')}
              onConfirm={() => {
                setConfirmArchive(false)
                toggleActiveMutation.mutate()
              }}
            />
          </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('form.infoTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
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
              <Label>{t('fields.assignedChildren')}</Label>
              <ChildMultiSelect selected={children} onChange={(c) => { setChildren(c); if (c.length > 0) setChildrenError(null) }} />
              {childrenError && <p className="text-sm text-destructive">{childrenError}</p>}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { resetInfoForm(); setChildren(parent.assigned_children); setChildrenError(null) }}
              >
                Annuler
              </Button>
              {canWrite && (
              <Button type="submit" disabled={isSavingInfo}>
                {isSavingInfo ? <><Loader2 className="mr-2 size-4 animate-spin" /> {t('form.saving')}</> : t('form.save')}
              </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </PageMotion>
  )
}
