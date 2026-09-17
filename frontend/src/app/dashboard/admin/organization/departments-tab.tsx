'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Building, Loader2, Pencil, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { organizationApi } from '@/lib/api/organization.api'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import type { Department } from '@/types/organization'

const schema = z.object({
  name: z.string().min(1, 'Nom requis').max(100),
  description: z.string().max(300).optional().or(z.literal('')),
})
type Form = z.infer<typeof schema>

export function DepartmentsTab() {
  const queryClient = useQueryClient()
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('organization:write')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Department | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['departments', { includeInactive }],
    queryFn: () => organizationApi.listDepartments(includeInactive).then((r) => r.data),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['departments'] })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  const openCreate = () => {
    setEditing(null)
    reset({ name: '', description: '' })
    setDialogOpen(true)
  }

  const openEdit = (dept: Department) => {
    setEditing(dept)
    reset({ name: dept.name, description: dept.description ?? '' })
    setDialogOpen(true)
  }

  const onSubmit = async (values: Form) => {
    try {
      const payload = { name: values.name, description: values.description || undefined }
      if (editing) {
        await organizationApi.updateDepartment(editing.id, payload)
        toast.success('Département mis à jour.')
      } else {
        await organizationApi.createDepartment(payload)
        toast.success('Département créé.')
      }
      setDialogOpen(false)
      invalidate()
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  const toggleActiveMutation = useMutation({
    mutationFn: (dept: Department) =>
      organizationApi.updateDepartment(dept.id, { is_active: !dept.is_active }),
    onSuccess: (_, dept) => {
      toast.success(dept.is_active ? 'Département désactivé.' : 'Département réactivé.')
      invalidate()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const departments = data ?? []

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch id="dept-include-inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} />
          <Label htmlFor="dept-include-inactive" className="text-sm text-white font-semibold">Inclure les départements inactifs</Label>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          {canWrite && (
          <DialogTrigger render={<Button onClick={openCreate} />}>
            <Plus className="mr-1.5 size-4" />
            Nouveau département
          </DialogTrigger>
          )}
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? 'Modifier le département' : 'Nouveau département'}</DialogTitle>
              <DialogDescription>
                Premier niveau de la hiérarchie (Département → Section → Groupe).
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="d_name">Nom</Label>
                <Input id="d_name" {...register('name')} aria-invalid={!!errors.name} />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="d_description">Description (optionnelle)</Label>
                <Textarea id="d_description" rows={3} {...register('description')} />
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
                <TableHead>Description</TableHead>
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
              ) : departments.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <Building className="size-5" />
                      </div>
                      <p className="font-medium text-foreground">Aucun département pour le moment.</p>
                      <p className="max-w-sm text-sm">
                        Créez le premier département pour commencer à structurer votre établissement.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                departments.map((dept) => (
                  <TableRow key={dept.id}>
                    <TableCell className="font-medium">{dept.name}</TableCell>
                    <TableCell className="text-muted-foreground">{dept.description ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={dept.is_active ? 'default' : 'outline'}>
                        {dept.is_active ? 'Actif' : 'Inactif'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {canWrite && (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(dept)} aria-label={`Modifier ${dept.name}`}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleActiveMutation.mutate(dept)}
                        >
                          {dept.is_active ? 'Désactiver' : 'Réactiver'}
                        </Button>
                      </div>
                      )}
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
