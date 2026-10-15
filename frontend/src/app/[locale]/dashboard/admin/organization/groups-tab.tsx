'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, Pencil, Plus, Search, UserMinus, UserPlus, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { TableBody, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { organizationApi } from '@/lib/api/organization.api'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { staffApi } from '@/lib/api/staff.api'
import { childrenApi } from '@/lib/api/children.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { InactiveSwitch } from '@/components/dashboard/shared/filters'
import { DataTable, DataTableHead, TableSkeletonRows, Td, Th } from '@/components/dashboard/shared/table'
import { StatusPill } from '@/components/dashboard/shared/cards'
import type { Group } from '@/types/organization'
import { displayName } from '@/lib/utils/display-name'

type T = (key: string) => string

const makeSchema = (t: T) => z.object({
  section_id: z.string().min(1, t('groups.sectionRequired')),
  educatrice_id: z.string().min(1, t('groups.educatriceRequired')),
  name: z.string().max(100).optional().or(z.literal('')),
})
type Form = z.infer<ReturnType<typeof makeSchema>>

const ALL = '__all__'

export function GroupsTab() {
  const t = useTranslations('organization')
  const tCommon = useTranslations('common')
  const queryClient = useQueryClient()
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('organization:write')
  const [filterSectionId, setFilterSectionId] = useState<string>(ALL)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Group | null>(null)
  const [manageGroupId, setManageGroupId] = useState<string | null>(null)
  const [childSearch, setChildSearch] = useState('')

  const { data: departments } = useQuery({
    queryKey: ['departments', { includeInactive: false }],
    queryFn: () => organizationApi.listDepartments(false).then((r) => r.data),
  })

  const { data: sections } = useQuery({
    queryKey: ['sections', { departmentId: ALL, includeInactive: false }],
    queryFn: () => organizationApi.listSections({ include_inactive: false }).then((r) => r.data),
  })

  const { data: educatrices } = useQuery({
    queryKey: ['staff', { staff_type: 'educateur' }],
    queryFn: () => staffApi.list({ staff_type: 'educateur', include_inactive: false, limit: 200 }).then((r) => r.data),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['groups', { sectionId: filterSectionId, includeInactive }],
    queryFn: () =>
      organizationApi
        .listGroups({
          section_id: filterSectionId === ALL ? undefined : filterSectionId,
          include_inactive: includeInactive,
        })
        .then((r) => r.data),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['groups'] })

  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(makeSchema(t)),
    defaultValues: { section_id: '', educatrice_id: '', name: '' },
  })

  const sectionLabel = (id: string) => {
    const s = sections?.find((s) => s.id === id)
    if (!s) return '—'
    const dept = departments?.find((d) => d.id === s.department_id)
    return dept ? `${dept.name} › ${s.name}` : s.name
  }

  const openCreate = () => {
    setEditing(null)
    reset({ section_id: filterSectionId === ALL ? '' : filterSectionId, educatrice_id: '', name: '' })
    setDialogOpen(true)
  }

  const openEdit = (group: Group) => {
    setEditing(group)
    reset({ section_id: group.section_id, educatrice_id: group.educatrice.id, name: group.name })
    setDialogOpen(true)
  }

  const onSubmit = async (values: Form) => {
    try {
      if (editing) {
        await organizationApi.updateGroup(editing.id, {
          name: values.name || undefined,
          educatrice_id: values.educatrice_id,
        })
        toast.success(t('groups.updated'))
      } else {
        await organizationApi.createGroup({
          section_id: values.section_id,
          educatrice_id: values.educatrice_id,
          name: values.name || undefined,
        })
        toast.success(t('groups.created'))
      }
      setDialogOpen(false)
      invalidate()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  const toggleActiveMutation = useMutation({
    mutationFn: (group: Group) => organizationApi.updateGroup(group.id, { is_active: !group.is_active }),
    onSuccess: (_, group) => {
      toast.success(group.is_active ? t('groups.deactivated') : t('groups.reactivated'))
      invalidate()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const groups = data ?? []
  const hasSections = (sections?.length ?? 0) > 0
  const hasEducatrices = (educatrices?.items.length ?? 0) > 0
  const manageGroup = groups.find((g) => g.id === manageGroupId) ?? null

  const openManage = (group: Group) => {
    setManageGroupId(group.id)
    setChildSearch('')
  }

  const { data: availableChildren, isLoading: isLoadingAvailable } = useQuery({
    queryKey: ['children', { sectionId: manageGroup?.section_id, unassignedOnly: true, search: childSearch }],
    queryFn: () =>
      childrenApi
        .list({ section_id: manageGroup!.section_id, unassigned_only: true, search: childSearch || undefined, limit: 100 })
        .then((r) => r.data),
    enabled: !!manageGroup,
  })

  const assignMutation = useMutation({
    mutationFn: (childId: string) => organizationApi.assignChild(manageGroup!.id, childId),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['children'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const removeChildMutation = useMutation({
    mutationFn: (childId: string) => organizationApi.removeChild(manageGroup!.id, childId),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['children'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <Select
            items={{ [ALL]: t('groups.allSections'), ...Object.fromEntries((sections ?? []).map((s) => [s.id, sectionLabel(s.id)])) }}
            value={filterSectionId}
            onValueChange={(v) => setFilterSectionId(v ?? ALL)}
          >
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder={t('groups.allSections')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('groups.allSections')}</SelectItem>
              {sections?.map((s) => (
                <SelectItem key={s.id} value={s.id}>{sectionLabel(s.id)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <InactiveSwitch
            id="grp-include-inactive"
            checked={includeInactive}
            onCheckedChange={setIncludeInactive}
            label={t('groups.includeInactive')}
          />
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          {canWrite && (
          <DialogTrigger render={<Button onClick={openCreate} disabled={!hasSections || !hasEducatrices} />}>
            <Plus className="mr-1.5 size-4" />
            {t('groups.new')}
          </DialogTrigger>
          )}
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? t('groups.editTitle') : t('groups.newTitle')}</DialogTitle>
              <DialogDescription>
                {t('groups.hint')}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="g_section">{t('groups.section')}</Label>
                <Controller
                  control={control}
                  name="section_id"
                  render={({ field }) => (
                    <Select
                      items={Object.fromEntries((sections ?? []).map((s) => [s.id, sectionLabel(s.id)]))}
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!!editing}
                    >
                      <SelectTrigger id="g_section" className="w-full" aria-invalid={!!errors.section_id}>
                        <SelectValue placeholder={t('groups.chooseSection')} />
                      </SelectTrigger>
                      <SelectContent>
                        {sections?.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{sectionLabel(s.id)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.section_id && <p className="text-sm text-destructive">{errors.section_id.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="g_educatrice">{t('groups.educatrice')}</Label>
                <Controller
                  control={control}
                  name="educatrice_id"
                  render={({ field }) => (
                    <Select
                      items={Object.fromEntries(
                        (educatrices?.items ?? []).map((e) => [e.id, displayName(e)])
                      )}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger id="g_educatrice" className="w-full" aria-invalid={!!errors.educatrice_id}>
                        <SelectValue placeholder={t('groups.chooseEducatrice')} />
                      </SelectTrigger>
                      <SelectContent>
                        {educatrices?.items.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {displayName(e)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.educatrice_id && <p className="text-sm text-destructive">{errors.educatrice_id.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="g_name">{t('groups.nameOptional')}</Label>
                <Input id="g_name" placeholder={t('groups.namePlaceholder')} {...register('name')} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? <><Loader2 className="mr-2 size-4 animate-spin" /> {tCommon('states.saving')}</>
                    : editing ? t('common.save') : t('common.create')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable>
        <DataTableHead>
          <Th>{t('common.name')}</Th>
          <Th>{t('groups.section')}</Th>
          <Th>{t('groups.educatrice')}</Th>
          <Th>{t('groups.children')}</Th>
          <Th>{t('common.status')}</Th>
          <Th className="w-10" />
        </DataTableHead>
        <TableBody>
          {isLoading ? (
            <TableSkeletonRows
              count={3}
              widths={['h-4 w-28', 'h-4 w-36', 'h-4 w-28', 'h-4 w-10', 'h-5 w-14 rounded-full', '']}
            />
          ) : groups.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <Td colSpan={6} className="h-48 text-center">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                    <Users className="size-5" />
                  </div>
                  <p className="font-medium text-foreground">
                    {!hasSections
                      ? t('groups.needSection')
                      : !hasEducatrices
                        ? t('groups.noEducatrice')
                        : t('groups.empty')}
                  </p>
                </div>
              </Td>
            </TableRow>
          ) : (
            groups.map((group) => (
              <TableRow key={group.id}>
                <Td className="font-medium">{group.name}</Td>
                <Td className="text-muted-foreground">{sectionLabel(group.section_id)}</Td>
                <Td className="text-muted-foreground">
                  {displayName(group.educatrice)}
                </Td>
                <Td>
                  {canWrite && (
                  <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => openManage(group)}>
                    <Users className="size-3.5" />
                    {group.children.length}
                  </Button>
                  )}
                </Td>
                <Td>
                  <StatusPill active={group.is_active} />
                </Td>
                <Td>
                  {canWrite && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(group)} aria-label={t('common.edit', { name: group.name })}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActiveMutation.mutate(group)}>
                      {group.is_active ? t('common.deactivate') : t('common.reactivate')}
                    </Button>
                  </div>
                  )}
                </Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </DataTable>

      <Dialog open={!!manageGroupId} onOpenChange={(open) => !open && setManageGroupId(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('groups.manageTitle', { name: manageGroup?.name ?? '' })}</DialogTitle>
            <DialogDescription>
              {t('groups.manageHint')}
            </DialogDescription>
          </DialogHeader>

          {manageGroup && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  {t('groups.currentMembers', { count: manageGroup.children.length })}
                </Label>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border">
                  {manageGroup.children.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">{t('groups.noChildInGroup')}</p>
                  ) : (
                    manageGroup.children.map((child) => (
                      <div key={child.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">{child.last_name} {child.first_names} <span className="text-muted-foreground">· {child.matricule}</span></span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-10 w-10 shrink-0"
                          aria-label={t('groups.removeChild', { name: `${child.first_names} ${child.last_name}` })}
                          disabled={removeChildMutation.isPending}
                          onClick={() => removeChildMutation.mutate(child.id)}
                        >
                          <UserMinus className="size-4 text-destructive" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t('groups.addChild')}</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder={t('groups.searchChild')}
                    value={childSearch}
                    onChange={(e) => setChildSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border">
                  {isLoadingAvailable ? (
                    <div className="space-y-1 p-2">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : (availableChildren?.items.length ?? 0) === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">
                      {t('groups.noChildAvailable')}
                    </p>
                  ) : (
                    availableChildren!.items.map((child) => (
                      <div key={child.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">{child.last_name} {child.first_names} <span className="text-muted-foreground">· {child.matricule}</span></span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-10 w-10 shrink-0"
                          aria-label={t('groups.addChildAria', { name: `${child.first_names} ${child.last_name}` })}
                          disabled={assignMutation.isPending}
                          onClick={() => assignMutation.mutate(child.id)}
                        >
                          <UserPlus className="size-4 text-primary" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setManageGroupId(null)}>{t('groups.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
