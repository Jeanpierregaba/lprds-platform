'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, Pencil, Plus, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { TableBody, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { rbacApi } from '@/lib/api/rbac.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { InactiveSwitch } from '@/components/dashboard/shared/filters'
import { DataTable, DataTableHead, TableSkeletonRows, Td, Th } from '@/components/dashboard/shared/table'
import { StatusPill } from '@/components/dashboard/shared/cards'
import { PERMISSION_GROUPS } from '@/types/rbac'
import type { Role } from '@/types/rbac'

type T = (key: string) => string

const makeSchema = (t: T) => z.object({
  name: z.string().min(1, t('roles.nameRequired')).max(100),
  description: z.string().max(300).optional().or(z.literal('')),
  permissions: z.array(z.string()),
})
type Form = z.infer<ReturnType<typeof makeSchema>>

export function RolesTab() {
  const tNav = useTranslations('nav')
  const t = useTranslations('rbac')
  const queryClient = useQueryClient()
  const [includeInactive, setIncludeInactive] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Role | null>(null)

  const { data: permissions } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => rbacApi.listPermissions().then((r) => r.data),
  })

  const { data: roles, isLoading } = useQuery({
    queryKey: ['roles', { includeInactive }],
    queryFn: () => rbacApi.listRoles(includeInactive).then((r) => r.data),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['roles'] })

  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(makeSchema(t)),
    defaultValues: { permissions: [] },
  })

  const openCreate = () => {
    setEditing(null)
    reset({ name: '', description: '', permissions: [] })
    setDialogOpen(true)
  }

  const openEdit = (role: Role) => {
    setEditing(role)
    reset({
      name: role.name,
      description: role.description ?? '',
      permissions: role.permissions.map((p) => p.code),
    })
    setDialogOpen(true)
  }

  const onSubmit = async (values: Form) => {
    try {
      const payload = {
        name: values.name,
        description: values.description || undefined,
        permissions: values.permissions,
      }
      if (editing) {
        await rbacApi.updateRole(editing.id, payload)
        toast.success(t('roles.updated'))
      } else {
        await rbacApi.createRole(payload)
        toast.success(t('roles.created'))
      }
      setDialogOpen(false)
      invalidate()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  const toggleActiveMutation = useMutation({
    mutationFn: async (role: Role) => {
      if (role.is_active) {
        await rbacApi.deactivateRole(role.id)
      } else {
        await rbacApi.updateRole(role.id, { is_active: true })
      }
    },
    onSuccess: (_, role) => {
      toast.success(role.is_active ? t('roles.deactivated') : t('roles.reactivated'))
      invalidate()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const items = roles ?? []

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <InactiveSwitch
          id="role-include-inactive"
          checked={includeInactive}
          onCheckedChange={setIncludeInactive}
          label={t('roles.includeInactive')}
        />

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button onClick={openCreate} />}>
            <Plus className="mr-1.5 size-4" />
            {t('roles.new')}
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? t('roles.editTitle') : t('roles.newTitle')}</DialogTitle>
              <DialogDescription>
                Ex. Directrice, Assistant de direction... Les droits attribués s&apos;appliquent
                à tout membre du personnel qui portera ce rôle.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="r_name">{t('roles.name')}</Label>
                <Input id="r_name" {...register('name')} aria-invalid={!!errors.name} />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="r_description">{t('roles.descriptionOptional')}</Label>
                <Textarea id="r_description" rows={2} {...register('description')} />
              </div>
              <div className="space-y-2">
                <Label>{t('roles.permissions')}</Label>
                <Controller
                  control={control}
                  name="permissions"
                  render={({ field }) => {
                    const toggle = (code: string, next: boolean | string) => {
                      field.onChange(
                        next === true
                          ? [...field.value, code]
                          : field.value.filter((c) => c !== code)
                      )
                    }
                    const checkbox = (code: string, label: string) => {
                      const checked = field.value.includes(code)
                      return (
                        <label key={code} className="flex items-start gap-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) => toggle(code, next)}
                            className="mt-0.5"
                          />
                          <span>{label}</span>
                        </label>
                      )
                    }
                    const byCode = new Map((permissions ?? []).map((p) => [p.code, p]))
                    const grouped: Set<string> = new Set(PERMISSION_GROUPS.flatMap((g) => g.codes))
                    const ungrouped = (permissions ?? []).filter((p) => !grouped.has(p.code))
                    return (
                      <div className="space-y-3 rounded-md border border-border p-3">
                        {PERMISSION_GROUPS.map((group) => {
                          const items = group.codes
                            .map((code) => byCode.get(code))
                            .filter((p) => p !== undefined)
                          if (items.length === 0) return null
                          return (
                            <fieldset key={group.moduleKey} className="space-y-1.5">
                              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {tNav(`modules.${group.moduleKey}`)}
                              </legend>
                              <div className="grid gap-2.5 sm:grid-cols-2">
                                {items.map((perm) => checkbox(perm.code, t(`permissions.${perm.code}`)))}
                              </div>
                            </fieldset>
                          )
                        })}
                        {ungrouped.length > 0 && (
                          <fieldset className="space-y-1.5">
                            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {t('permissionsOther')}
                            </legend>
                            <div className="grid gap-2.5 sm:grid-cols-2">
                              {ungrouped.map((perm) => checkbox(perm.code, t(`permissions.${perm.code}`)))}
                            </div>
                          </fieldset>
                        )}
                      </div>
                    )
                  }}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? <><Loader2 className="mr-2 size-4 animate-spin" /> Enregistrement...</>
                    : editing ? t('roles.save') : t('roles.create')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable>
        <DataTableHead>
          <Th>{t('roles.name')}</Th>
          <Th>{t('roles.permissions')}</Th>
          <Th>{t('roles.status')}</Th>
          <Th className="w-10" />
        </DataTableHead>
        <TableBody>
          {isLoading ? (
            <TableSkeletonRows
              count={3}
              widths={['h-4 w-32', 'h-4 w-48', 'h-5 w-14 rounded-full', '']}
            />
          ) : items.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <Td colSpan={4} className="h-48 text-center">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                    <ShieldCheck className="size-5" />
                  </div>
                  <p className="font-medium text-foreground">{t('roles.empty')}</p>
                  <p className="max-w-sm text-sm">
                    Créez des rôles pour donner des droits fins à votre personnel (ex. Directrice, Secrétaire).
                  </p>
                </div>
              </Td>
            </TableRow>
          ) : (
            items.map((role) => (
              <TableRow key={role.id}>
                <Td>
                  <div className="font-medium">{role.name}</div>
                  {role.description && (
                    <div className="text-xs text-muted-foreground">{role.description}</div>
                  )}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {role.permissions.length === 0 ? (
                      <span className="text-muted-foreground">{t('roles.noPermission')}</span>
                    ) : (
                      role.permissions.slice(0, 4).map((p) => (
                        <span key={p.id} className="inline-block rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">{p.code}</span>
                      ))
                    )}
                    {role.permissions.length > 4 && (
                      <span className="inline-block rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                        +{role.permissions.length - 4}
                      </span>
                    )}
                  </div>
                </Td>
                <Td>
                  <StatusPill active={role.is_active} />
                </Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(role)} aria-label={t('roles.edit', { name: role.name })}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActiveMutation.mutate(role)}>
                      {role.is_active ? t('roles.deactivate') : t('roles.reactivate')}
                    </Button>
                  </div>
                </Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </DataTable>
    </div>
  )
}
