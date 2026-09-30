'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { intlLocale } from '@/lib/utils/locale-format'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Pencil, Plus, Tags, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TableBody, TableRow } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { blogApi } from '@/lib/api/blog.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { DataTable, DataTableHead, TableSkeletonRows, Td, Th } from '@/components/dashboard/shared/table'
import { ConfirmDialog } from '@/components/dashboard/shared/dialogs'
import type { BlogTag } from '@/types/blog'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(intlLocale())
}

export function TagsTab() {
  const t = useTranslations('blog')
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<BlogTag | null>(null)
  const [editName, setEditName] = useState('')
  const [tagToDelete, setTagToDelete] = useState<BlogTag | null>(null)

  const { data: tags, isLoading } = useQuery({
    queryKey: ['blog', 'tags'],
    queryFn: () => blogApi.listTags().then((r) => r.data.items),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['blog', 'tags'] })

  const createMutation = useMutation({
    mutationFn: (name: string) => blogApi.createTag(name),
    onSuccess: () => { toast.success(t('tags.created')); setCreateOpen(false); setNewName(''); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => blogApi.updateTag(id, name),
    onSuccess: () => { toast.success(t('tags.renamed')); setEditing(null); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => blogApi.deleteTag(id),
    onSuccess: () => { toast.success(t('tags.deleted')); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  return (
    <div className="space-y-4 pt-2">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button type="button" />}>
            <Plus className="mr-1.5 size-4" />
            {t('tags.new')}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('tags.newTitle')}</DialogTitle>
              <DialogDescription>{t('tags.hint')}</DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => { e.preventDefault(); if (newName.trim()) createMutation.mutate(newName.trim()) }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="new-tag-name">{t('tags.name')}</Label>
                <Input id="new-tag-name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={!newName.trim() || createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                  {t('tags.createSubmit')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable>
        <DataTableHead>
          <Th>{t('tags.name')}</Th>
          <Th>{t('tags.createdAt')}</Th>
          <Th className="w-24" />
        </DataTableHead>
        <TableBody>
          {isLoading ? (
            <TableSkeletonRows
              count={4}
              widths={['h-5 w-32 rounded-full', 'h-4 w-24', '']}
            />
          ) : !tags || tags.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <Td colSpan={3} className="h-40 text-center">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                    <Tags className="size-5" />
                  </div>
                  <p className="font-medium text-foreground">{t('tags.empty')}</p>
                </div>
              </Td>
            </TableRow>
          ) : (
            tags.map((tag) => (
              <TableRow key={tag.id}>
                <Td>
                  <span className="inline-block rounded-full bg-teal px-3 py-1 text-xs font-semibold text-white">
                    {tag.name}
                  </span>
                </Td>
                <Td className="text-muted-foreground">{formatDate(tag.created_at)}</Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => { setEditing(tag); setEditName(tag.name) }}
                      aria-label={t('tags.rename')}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('tags.delete')}
                      onClick={() => setTagToDelete(tag)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </DataTable>

      <ConfirmDialog
        open={!!tagToDelete}
        onOpenChange={(open) => !open && setTagToDelete(null)}
        title={`Supprimer l\u2019étiquette « ${tagToDelete?.name ?? ''} » ?`}
        description={t('tags.deleteBody')}
        confirmLabel={t('tags.delete')}
        onConfirm={() => {
          if (tagToDelete) deleteMutation.mutate(tagToDelete.id)
          setTagToDelete(null)
        }}
      />

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('tags.renameTitle')}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (editing && editName.trim()) updateMutation.mutate({ id: editing.id, name: editName.trim() })
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="edit-tag-name">{t('tags.name')}</Label>
              <Input id="edit-tag-name" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!editName.trim() || updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                {t('tags.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
