'use client'

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
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { rbacApi } from '@/lib/api/rbac.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { PERMISSION_GROUPS } from '@/types/rbac'
import type { Role } from '@/types/rbac'

const schema = z.object({
  name: z.string().min(1, 'Nom requis').max(100),
  description: z.string().max(300).optional().or(z.literal('')),
  permissions: z.array(z.string()),
})
type Form = z.infer<typeof schema>

export function RolesTab() {
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
    resolver: zodResolver(schema),
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
        toast.success('Rôle mis à jour.')
      } else {
        await rbacApi.createRole(payload)
        toast.success('Rôle créé.')
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
      toast.success(role.is_active ? 'Rôle désactivé.' : 'Rôle réactivé.')
      invalidate()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const items = roles ?? []

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch id="role-include-inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} />
          <Label htmlFor="role-include-inactive" className="text-sm text-white font-semibold">Inclure les rôles inactifs</Label>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button onClick={openCreate} />}>
            <Plus className="mr-1.5 size-4" />
            Nouveau rôle
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? 'Modifier le rôle' : 'Nouveau rôle'}</DialogTitle>
              <DialogDescription>
                Ex. Directrice, Assistant de direction... Les droits attribués s&apos;appliquent
                à tout membre du personnel qui portera ce rôle.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="r_name">Nom</Label>
                <Input id="r_name" {...register('name')} aria-invalid={!!errors.name} />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="r_description">Description (optionnelle)</Label>
                <Textarea id="r_description" rows={2} {...register('description')} />
              </div>
              <div className="space-y-2">
                <Label>Permissions</Label>
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
                            <fieldset key={group.module} className="space-y-1.5">
                              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {group.module}
                              </legend>
                              <div className="grid gap-2.5 sm:grid-cols-2">
                                {items.map((perm) => checkbox(perm.code, perm.label))}
                              </div>
                            </fieldset>
                          )
                        })}
                        {ungrouped.length > 0 && (
                          <fieldset className="space-y-1.5">
                            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Autres
                            </legend>
                            <div className="grid gap-2.5 sm:grid-cols-2">
                              {ungrouped.map((perm) => checkbox(perm.code, perm.label))}
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
                <TableHead>Permissions</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <ShieldCheck className="size-5" />
                      </div>
                      <p className="font-medium text-foreground">Aucun rôle pour le moment.</p>
                      <p className="max-w-sm text-sm">
                        Créez des rôles pour donner des droits fins à votre personnel (ex. Directrice, Secrétaire).
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell>
                      <div className="font-medium">{role.name}</div>
                      {role.description && (
                        <div className="text-xs text-muted-foreground">{role.description}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {role.permissions.length === 0 ? (
                          <span className="text-muted-foreground">Aucune</span>
                        ) : (
                          role.permissions.slice(0, 4).map((p) => (
                            <Badge key={p.id} variant="outline" className="font-normal">{p.code}</Badge>
                          ))
                        )}
                        {role.permissions.length > 4 && (
                          <Badge variant="outline" className="font-normal">
                            +{role.permissions.length - 4}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={role.is_active ? 'default' : 'outline'}>
                        {role.is_active ? 'Actif' : 'Inactif'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(role)} aria-label={`Modifier ${role.name}`}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleActiveMutation.mutate(role)}>
                          {role.is_active ? 'Désactiver' : 'Réactiver'}
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
    </div>
  )
}
