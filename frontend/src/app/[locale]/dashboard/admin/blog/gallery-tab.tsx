'use client'

import { useTranslations } from 'next-intl'

import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Images, Loader2, Pencil, Plus, Trash2, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { blogApi } from '@/lib/api/blog.api'
import { AuthMedia } from './auth-media'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { ConfirmDialog } from '@/components/dashboard/shared/dialogs'
import type { GalleryPhotoCategory } from '@/types/blog'

const ALL = '__all__'

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function useGalleryCategories() {
  return useQuery({
    queryKey: ['blog', 'gallery-categories'],
    queryFn: () => blogApi.listGalleryCategories().then((r) => r.data.items),
  })
}

export function GalleryTab() {
  const t = useTranslations('blog')
  const tCommon = useTranslations('common')
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [categoryId, setCategoryId] = useState<string>(ALL)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadCategoryId, setUploadCategoryId] = useState('')
  const [manageOpen, setManageOpen] = useState(false)
  const [photoToDelete, setPhotoToDelete] = useState<{ id: string } | null>(null)
  const [file, setFile] = useState<File | null>(null)

  const { data: categories = [] } = useGalleryCategories()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['blog', 'gallery'] })
    queryClient.invalidateQueries({ queryKey: ['blog', 'gallery-categories'] })
  }

  const { data, isLoading } = useQuery({
    queryKey: ['blog', 'gallery', { categoryId }],
    queryFn: () =>
      blogApi
        .listGallery({ category_id: categoryId === ALL ? undefined : categoryId })
        .then((r) => r.data),
  })

  const uploadMutation = useMutation({
    mutationFn: ({ categoryId: cid, file: f }: { categoryId: string; file: File }) =>
      blogApi.uploadGallery(cid, f),
    onSuccess: () => {
      toast.success(t('gallery.published'))
      setUploadOpen(false)
      setFile(null)
      setUploadCategoryId('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      invalidate()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => blogApi.deleteGallery(id),
    onSuccess: () => { toast.success(t('gallery.photoDeleted')); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const categoryItems = Object.fromEntries(categories.map((c) => [c.id, c.name]))

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t('gallery.count', { count: total })}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Select items={{ [ALL]: t('gallery.allCategories'), ...categoryItems }}
            value={categoryId} onValueChange={(v) => setCategoryId(v ?? ALL)}>
            <SelectTrigger className="h-9 w-full sm:w-52">
              <SelectValue placeholder={t('gallery.allCategories')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('gallery.allCategories')}</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={() => setManageOpen(true)}>
            <Pencil className="mr-1.5 size-4" />
            {t('gallery.categories')}
          </Button>

          <Dialog open={uploadOpen} onOpenChange={(open) => {
            setUploadOpen(open)
            if (!open) { setFile(null); setUploadCategoryId(''); if (fileInputRef.current) fileInputRef.current.value = '' }
          }}>
            <DialogTrigger render={<Button type="button" />}>
              <Upload className="mr-1.5 size-4" />
              {t('gallery.addPhoto')}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('gallery.publishTitle')}</DialogTitle>
                <DialogDescription>{t('photoPublishHint')}</DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (file && uploadCategoryId) uploadMutation.mutate({ categoryId: uploadCategoryId, file })
                }}
                className="space-y-4"
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="gallery-category">{t('gallery.category')}</Label>
                  <Select items={categoryItems} value={uploadCategoryId}
                    onValueChange={(v) => setUploadCategoryId(v ?? '')}>
                    <SelectTrigger id="gallery-category" className="h-9 w-full">
                      <SelectValue placeholder={t('gallery.chooseCategory')} />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {categories.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t('gallery.needCategory')}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="gallery-file">{t('gallery.photo')}</Label>
                  <Input
                    id="gallery-file"
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('gallery.imagesOnly')}
                  </p>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={!file || !uploadCategoryId || uploadMutation.isPending}>
                    {uploadMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                    {t('gallery.publish')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square w-full rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <Images className="size-5" />
              </div>
              <p className="font-medium text-foreground">{t('gallery.empty')}</p>
              <p className="text-sm">{t('gallery.emptyHint')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {items.map((photo) => (
                <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-xl border bg-muted">
                  <AuthMedia
                    queryKey={['blog', 'gallery-image', photo.id]}
                    fetchBlob={() => blogApi.downloadGalleryImage(photo.id).then((r) => r.data)}
                    contentType={photo.content_type}
                    alt={photo.filename}
                    className="size-full"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent p-2 pt-6 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100">
                    <p className="truncate text-xs font-medium text-white">{photo.filename}</p>
                    <p className="truncate text-xs text-white/75">
                      {photo.category?.name ?? t('gallery.noCategory')} · {formatSize(photo.size_bytes)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-sm"
                    className="absolute right-2 top-2 h-10 w-10 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100"
                    aria-label={t('gallery.deletePhoto')}
                    onClick={() => setPhotoToDelete({ id: photo.id })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CategoriesManager open={manageOpen} onOpenChange={setManageOpen} />

      <ConfirmDialog
        open={!!photoToDelete}
        onOpenChange={(open) => !open && setPhotoToDelete(null)}
        title={t('gallery.deletePhotoTitle')}
        description={t('gallery.deletePhotoBody')}
        confirmLabel={tCommon('actions.delete')}
        onConfirm={() => {
          if (photoToDelete) deleteMutation.mutate(photoToDelete.id)
          setPhotoToDelete(null)
        }}
      />
    </div>
  )
}

function CategoriesManager({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('blog')
  const tCommon = useTranslations('common')
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<GalleryPhotoCategory | null>(null)
  const [editName, setEditName] = useState('')
  const [editNameEn, setEditNameEn] = useState('')
  const [deleting, setDeleting] = useState<GalleryPhotoCategory | null>(null)

  const { data: categories = [], isLoading } = useGalleryCategories()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['blog', 'gallery-categories'] })
    queryClient.invalidateQueries({ queryKey: ['blog', 'gallery'] })
  }

  const createMutation = useMutation({
    mutationFn: (name: string) => blogApi.createGalleryCategory(name),
    onSuccess: () => { toast.success(t('gallery.categoryCreated')); setNewName(''); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, name, nameEn }: { id: string; name: string; nameEn: string }) =>
      blogApi.updateGalleryCategory(id, name, nameEn),
    onSuccess: () => { toast.success(t('gallery.categoryRenamed')); setEditing(null); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => blogApi.deleteGalleryCategory(id),
    onSuccess: () => { toast.success(t('gallery.categoryDeleted')); setDeleting(null); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('gallery.categoriesTitle')}</DialogTitle>
            <DialogDescription>{t('categoryNameHint')}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); if (newName.trim()) createMutation.mutate(newName.trim()) }}
            className="flex gap-2"
          >
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('gallery.newCategoryPlaceholder')}
              aria-label={t('gallery.newCategoryAria')}
            />
            <Button type="submit" disabled={!newName.trim() || createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              <span className="sr-only">{t('gallery.createCategory')}</span>
            </Button>
          </form>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : categories.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t('gallery.noCategory2')}</p>
            ) : (
              categories.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                  {editing?.id === c.id ? (
                    <form
                      className="flex flex-1 gap-2"
                      onSubmit={(e) => {
                        e.preventDefault()
                        if (editName.trim()) {
                          updateMutation.mutate({
                            id: c.id, name: editName.trim(), nameEn: editNameEn.trim(),
                          })
                        }
                      }}
                    >
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus aria-label={t('gallery.newNameAria')} />
                      <Input
                        value={editNameEn}
                        onChange={(e) => setEditNameEn(e.target.value)}
                        aria-label={t('gallery.categoryNameEn')}
                        placeholder={t('gallery.categoryNameEn')}
                      />
                      <Button type="submit" size="sm" disabled={!editName.trim() || updateMutation.isPending}>
                        OK
                      </Button>
                    </form>
                  ) : (
                    <>
                      <span className="text-sm font-medium">{c.name}</span>
                      <span className="flex gap-1">
                        <Button
                          variant="ghost" size="icon-sm" aria-label={t('gallery.renameCategory', { name: c.name })}
                          onClick={() => { setEditing(c); setEditName(c.name); setEditNameEn(c.name_en ?? '') }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon-sm" aria-label={t('gallery.deleteCategory', { name: c.name })}
                          onClick={() => setDeleting(c)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </span>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('gallery.deleteCategoryTitleNamed', { name: deleting?.name ?? '' })}
        description={t('gallery.deleteCategoryBody')}
        confirmLabel={tCommon('actions.delete')}
        confirmDisabled={deleteMutation.isPending}
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id)
        }}
      />
    </>
  )
}
