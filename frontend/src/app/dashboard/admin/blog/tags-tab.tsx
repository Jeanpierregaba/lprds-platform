'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Pencil, Plus, Tags, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { blogApi } from '@/lib/api/blog.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import type { BlogTag } from '@/types/blog'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR')
}

export function TagsTab() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<BlogTag | null>(null)
  const [editName, setEditName] = useState('')

  const { data: tags, isLoading } = useQuery({
    queryKey: ['blog', 'tags'],
    queryFn: () => blogApi.listTags().then((r) => r.data.items),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['blog', 'tags'] })

  const createMutation = useMutation({
    mutationFn: (name: string) => blogApi.createTag(name),
    onSuccess: () => { toast.success('Étiquette créée.'); setCreateOpen(false); setNewName(''); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => blogApi.updateTag(id, name),
    onSuccess: () => { toast.success('Étiquette renommée.'); setEditing(null); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => blogApi.deleteTag(id),
    onSuccess: () => { toast.success('Étiquette supprimée.'); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  return (
    <div className="space-y-4 pt-2">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button type="button" />}>
            <Plus className="mr-1.5 size-4" />
            Nouvelle étiquette
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvelle étiquette</DialogTitle>
              <DialogDescription>Nom unique par établissement.</DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => { e.preventDefault(); if (newName.trim()) createMutation.mutate(newName.trim()) }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="new-tag-name">Nom</Label>
                <Input id="new-tag-name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={!newName.trim() || createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                  Créer
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          <Table className="border-collapse">
            <TableHeader className="bg-primary [&_tr]:border-transparent">
              <TableRow className="bg-primary hover:bg-primary">
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Nom</TableHead>
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Créée le</TableHead>
                <TableHead className="w-24 px-5 py-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-5 py-4"><Skeleton className="h-5 w-32 rounded-full" /></TableCell>
                    <TableCell className="px-5 py-4"><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="px-5 py-4" />
                  </TableRow>
                ))
              ) : !tags || tags.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={3} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <Tags className="size-5" />
                      </div>
                      <p className="font-medium text-foreground">Aucune étiquette.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                tags.map((tag) => (
                  <TableRow key={tag.id}>
                    <TableCell className="px-5 py-4">
                      <span className="inline-block rounded-full bg-teal px-3 py-1 text-xs font-semibold text-white">
                        {tag.name}
                      </span>
                    </TableCell>
                    <TableCell className="px-5 py-4 text-muted-foreground">{formatDate(tag.created_at)}</TableCell>
                    <TableCell className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => { setEditing(tag); setEditName(tag.name) }}
                          aria-label="Renommer"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Supprimer" />}>
                            <Trash2 className="size-4" />
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Supprimer l&apos;étiquette « {tag.name} » ?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Suppression définitive. Les articles qui la portaient passeront sans étiquette.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuler</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate(tag.id)}>Supprimer</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renommer l&apos;étiquette</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (editing && editName.trim()) updateMutation.mutate({ id: editing.id, name: editName.trim() })
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="edit-tag-name">Nom</Label>
              <Input id="edit-tag-name" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!editName.trim() || updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
