'use client'

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
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { organizationApi } from '@/lib/api/organization.api'
import { staffApi } from '@/lib/api/staff.api'
import { childrenApi } from '@/lib/api/children.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import type { Group } from '@/types/organization'

const schema = z.object({
  section_id: z.string().min(1, 'Section requise'),
  educatrice_id: z.string().min(1, 'Éducatrice requise'),
  name: z.string().max(100).optional().or(z.literal('')),
})
type Form = z.infer<typeof schema>

const ALL = '__all__'

export function GroupsTab() {
  const queryClient = useQueryClient()
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
    resolver: zodResolver(schema),
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
        toast.success('Groupe mis à jour.')
      } else {
        await organizationApi.createGroup({
          section_id: values.section_id,
          educatrice_id: values.educatrice_id,
          name: values.name || undefined,
        })
        toast.success('Groupe créé.')
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
      toast.success(group.is_active ? 'Groupe désactivé.' : 'Groupe réactivé.')
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
            items={{ [ALL]: 'Toutes les sections', ...Object.fromEntries((sections ?? []).map((s) => [s.id, sectionLabel(s.id)])) }}
            value={filterSectionId}
            onValueChange={(v) => setFilterSectionId(v ?? ALL)}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Toutes les sections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Toutes les sections</SelectItem>
              {sections?.map((s) => (
                <SelectItem key={s.id} value={s.id}>{sectionLabel(s.id)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch id="grp-include-inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} />
            <Label htmlFor="grp-include-inactive" className="text-sm">Inclure les groupes inactifs</Label>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button onClick={openCreate} disabled={!hasSections || !hasEducatrices} />}>
            <Plus className="mr-1.5 size-4" />
            Nouveau groupe
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? 'Modifier le groupe' : 'Nouveau groupe'}</DialogTitle>
              <DialogDescription>
                Une éducatrice ne peut mener qu&apos;un seul groupe actif par section.
                L&apos;assignation des enfants se fait depuis le compteur &laquo;&nbsp;Enfants&nbsp;&raquo; de la liste des groupes.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="g_section">Section</Label>
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
                        <SelectValue placeholder="Choisir une section" />
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
                <Label htmlFor="g_educatrice">Éducatrice</Label>
                <Controller
                  control={control}
                  name="educatrice_id"
                  render={({ field }) => (
                    <Select
                      items={Object.fromEntries(
                        (educatrices?.items ?? []).map((e) => [e.id, e.nickname || `${e.first_name} ${e.last_name}`])
                      )}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger id="g_educatrice" className="w-full" aria-invalid={!!errors.educatrice_id}>
                        <SelectValue placeholder="Choisir une éducatrice" />
                      </SelectTrigger>
                      <SelectContent>
                        {educatrices?.items.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.nickname || `${e.first_name} ${e.last_name}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.educatrice_id && <p className="text-sm text-destructive">{errors.educatrice_id.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="g_name">Nom (optionnel)</Label>
                <Input id="g_name" placeholder="Par défaut : surnom de l'éducatrice" {...register('name')} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? <><Loader2 className="mr-2 size-4 animate-spin" /> Enregistrement...</>
                    : editing ? 'Enregistrer' : 'Créer'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Éducatrice</TableHead>
                <TableHead>Enfants</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : groups.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <Users className="size-5" />
                      </div>
                      <p className="font-medium text-foreground">
                        {!hasSections
                          ? 'Créez d\'abord une section.'
                          : !hasEducatrices
                            ? 'Aucune éducatrice active disponible pour l\'instant.'
                            : 'Aucun groupe pour le moment.'}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className="font-medium">{group.name}</TableCell>
                    <TableCell className="text-muted-foreground">{sectionLabel(group.section_id)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {group.educatrice.nickname || `${group.educatrice.first_name} ${group.educatrice.last_name}`}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => openManage(group)}>
                        <Users className="size-3.5" />
                        {group.children.length}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Badge variant={group.is_active ? 'default' : 'outline'}>
                        {group.is_active ? 'Actif' : 'Inactif'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(group)} aria-label={`Modifier ${group.name}`}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleActiveMutation.mutate(group)}>
                          {group.is_active ? 'Désactiver' : 'Réactiver'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!manageGroupId} onOpenChange={(open) => !open && setManageGroupId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Enfants du groupe {manageGroup?.name}</DialogTitle>
            <DialogDescription>
              Un enfant ne peut appartenir qu&apos;à un seul groupe à la fois — retirez-le d&apos;abord
              de son groupe actuel pour pouvoir l&apos;affecter ici.
            </DialogDescription>
          </DialogHeader>

          {manageGroup && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Membres actuels ({manageGroup.children.length})
                </Label>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border">
                  {manageGroup.children.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">Aucun enfant dans ce groupe.</p>
                  ) : (
                    manageGroup.children.map((child) => (
                      <div key={child.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span>{child.last_name} {child.first_names} <span className="text-muted-foreground">· {child.matricule}</span></span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Retirer ${child.first_names} ${child.last_name}`}
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
                <Label className="text-xs text-muted-foreground">Ajouter un enfant (sans groupe, même section)</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Rechercher un enfant..."
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
                      Aucun enfant disponible dans cette section.
                    </p>
                  ) : (
                    availableChildren!.items.map((child) => (
                      <div key={child.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span>{child.last_name} {child.first_names} <span className="text-muted-foreground">· {child.matricule}</span></span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Ajouter ${child.first_names} ${child.last_name}`}
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
            <Button variant="outline" onClick={() => setManageGroupId(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
