'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { LayoutGrid, Loader2, Pencil, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TableBody, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { organizationApi } from '@/lib/api/organization.api'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { InactiveSwitch } from '@/components/dashboard/shared/filters'
import { DataTable, DataTableHead, TableSkeletonRows, Td, Th } from '@/components/dashboard/shared/table'
import { StatusPill } from '@/components/dashboard/shared/cards'
import type { Section } from '@/types/organization'

type T = (key: string) => string

const makeSchema = (t: T) => z.object({
  department_id: z.string().min(1, t('sections.departmentRequired')),
  name: z.string().min(1, t('common.nameRequired')).max(100),
  description: z.string().max(300).optional().or(z.literal('')),
})
type Form = z.infer<ReturnType<typeof makeSchema>>

const ALL = '__all__'

export function SectionsTab() {
  const t = useTranslations('organization')
  const tCommon = useTranslations('common')
  const queryClient = useQueryClient()
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('organization:write')
  const [filterDepartmentId, setFilterDepartmentId] = useState<string>(ALL)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Section | null>(null)

  const { data: departments } = useQuery({
    queryKey: ['departments', { includeInactive: false }],
    queryFn: () => organizationApi.listDepartments(false).then((r) => r.data),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['sections', { departmentId: filterDepartmentId, includeInactive }],
    queryFn: () =>
      organizationApi
        .listSections({
          department_id: filterDepartmentId === ALL ? undefined : filterDepartmentId,
          include_inactive: includeInactive,
        })
        .then((r) => r.data),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['sections'] })

  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(makeSchema(t)),
    defaultValues: { department_id: '', name: '', description: '' },
  })

  const openCreate = () => {
    setEditing(null)
    reset({ department_id: filterDepartmentId === ALL ? '' : filterDepartmentId, name: '', description: '' })
    setDialogOpen(true)
  }

  const openEdit = (section: Section) => {
    setEditing(section)
    reset({ department_id: section.department_id, name: section.name, description: section.description ?? '' })
    setDialogOpen(true)
  }

  const onSubmit = async (values: Form) => {
    try {
      if (editing) {
        await organizationApi.updateSection(editing.id, {
          name: values.name,
          description: values.description || undefined,
        })
        toast.success(t('sections.updated'))
      } else {
        await organizationApi.createSection({
          department_id: values.department_id,
          name: values.name,
          description: values.description || undefined,
        })
        toast.success(t('sections.created'))
      }
      setDialogOpen(false)
      invalidate()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  const toggleActiveMutation = useMutation({
    mutationFn: (section: Section) =>
      organizationApi.updateSection(section.id, { is_active: !section.is_active }),
    onSuccess: (_, section) => {
      toast.success(section.is_active ? t('sections.deactivated') : t('sections.reactivated'))
      invalidate()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const departmentName = (id: string) => departments?.find((d) => d.id === id)?.name ?? '—'
  const sections = data ?? []
  const hasDepartments = (departments?.length ?? 0) > 0

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <Select
            items={{ [ALL]: t('sections.allDepartments'), ...Object.fromEntries((departments ?? []).map((d) => [d.id, d.name])) }}
            value={filterDepartmentId}
            onValueChange={(v) => setFilterDepartmentId(v ?? ALL)}
          >
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder={t('sections.allDepartments')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('sections.allDepartments')}</SelectItem>
              {departments?.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <InactiveSwitch
            id="sec-include-inactive"
            checked={includeInactive}
            onCheckedChange={setIncludeInactive}
            label={t('sections.includeInactive')}
          />
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          {canWrite && (
          <DialogTrigger render={<Button onClick={openCreate} disabled={!hasDepartments} />}>
            <Plus className="mr-1.5 size-4" />
            {t('sections.new')}
          </DialogTrigger>
          )}
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? t('sections.editTitle') : t('sections.newTitle')}</DialogTitle>
              <DialogDescription>{t('sections.hint')}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="s_department">{t('sections.department')}</Label>
                <Controller
                  control={control}
                  name="department_id"
                  render={({ field }) => (
                    <Select
                      items={Object.fromEntries((departments ?? []).map((d) => [d.id, d.name]))}
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!!editing}
                    >
                      <SelectTrigger id="s_department" className="w-full" aria-invalid={!!errors.department_id}>
                        <SelectValue placeholder={t('sections.chooseDepartment')} />
                      </SelectTrigger>
                      <SelectContent>
                        {departments?.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.department_id && <p className="text-sm text-destructive">{errors.department_id.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="s_name">{t('common.name')}</Label>
                <Input id="s_name" {...register('name')} aria-invalid={!!errors.name} />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="s_description">{t('common.descriptionOptional')}</Label>
                <Textarea id="s_description" rows={3} {...register('description')} />
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
          <Th>{t('sections.department')}</Th>
          <Th>{t('common.description')}</Th>
          <Th>{t('common.status')}</Th>
          <Th className="w-10" />
        </DataTableHead>
        <TableBody>
          {isLoading ? (
            <TableSkeletonRows
              count={3}
              widths={['h-4 w-32', 'h-4 w-28', 'h-4 w-48', 'h-5 w-14 rounded-full', '']}
            />
          ) : sections.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <Td colSpan={5} className="h-48 text-center">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                    <LayoutGrid className="size-5" />
                  </div>
                  <p className="font-medium text-foreground">
                    {hasDepartments ? t('sections.empty') : t('sections.needDepartment')}
                  </p>
                </div>
              </Td>
            </TableRow>
          ) : (
            sections.map((section) => (
              <TableRow key={section.id}>
                <Td className="font-medium">{section.name}</Td>
                <Td className="text-muted-foreground">{departmentName(section.department_id)}</Td>
                <Td className="text-muted-foreground">{section.description ?? '—'}</Td>
                <Td>
                  <StatusPill active={section.is_active} />
                </Td>
                <Td>
                  {canWrite && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(section)} aria-label={t('common.edit', { name: section.name })}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActiveMutation.mutate(section)}>
                      {section.is_active ? t('common.deactivate') : t('common.reactivate')}
                    </Button>
                  </div>
                  )}
                </Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </DataTable>
    </div>
  )
}
