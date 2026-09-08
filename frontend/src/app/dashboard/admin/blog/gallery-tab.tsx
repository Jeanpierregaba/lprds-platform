'use client'

import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Images, Loader2, Trash2, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { blogApi } from '@/lib/api/blog.api'
import { AuthMedia } from './auth-media'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { GALLERY_PHOTO_CATEGORIES, type GalleryCategory } from '@/types/blog'

const ALL = '__all__'

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export function GalleryTab() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [category, setCategory] = useState<string>(ALL)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadCategory, setUploadCategory] = useState<GalleryCategory>('activities')
  const [file, setFile] = useState<File | null>(null)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['blog', 'gallery'] })

  const { data, isLoading } = useQuery({
    queryKey: ['blog', 'gallery', { category }],
    queryFn: () =>
      blogApi
        .listGallery({ category: category === ALL ? undefined : (category as GalleryCategory) })
        .then((r) => r.data),
  })

  const uploadMutation = useMutation({
    mutationFn: ({ category, file: f }: { category: GalleryCategory; file: File }) =>
      blogApi.uploadGallery(category, f),
    onSuccess: () => {
      toast.success('Photo publiée dans la galerie du site vitrine.')
      setUploadOpen(false)
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      invalidate()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => blogApi.deleteGallery(id),
    onSuccess: () => { toast.success('Photo supprimée.'); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {total} photo{total > 1 ? 's' : ''} publiée{total > 1 ? 's' : ''} — visibles sur le site vitrine.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Select items={{ [ALL]: 'Toutes les catégories', ...GALLERY_PHOTO_CATEGORIES }}
            value={category} onValueChange={(v) => setCategory(v ?? ALL)}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Toutes les catégories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Toutes les catégories</SelectItem>
              {Object.entries(GALLERY_PHOTO_CATEGORIES).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={uploadOpen} onOpenChange={(open) => {
            setUploadOpen(open)
            if (!open) { setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }
          }}>
            <DialogTrigger render={<Button type="button" />}>
              <Upload className="mr-1.5 size-4" />
              Ajouter une photo
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Publier une photo</DialogTitle>
                <DialogDescription>
                  La photo apparaît immédiatement dans la galerie du site vitrine.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (file) uploadMutation.mutate({ category: uploadCategory, file })
                }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="gallery-category">Catégorie</Label>
                  <Select items={GALLERY_PHOTO_CATEGORIES} value={uploadCategory}
                    onValueChange={(v) => { if (v) setUploadCategory(v as GalleryCategory) }}>
                    <SelectTrigger id="gallery-category" className="w-full">
                      <SelectValue placeholder="Choisir une catégorie" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(GALLERY_PHOTO_CATEGORIES).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gallery-file">Photo</Label>
                  <Input
                    id="gallery-file"
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Images uniquement (JPG, PNG, GIF, WebP).
                  </p>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={!file || uploadMutation.isPending}>
                    {uploadMutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                    Publier
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
              <p className="font-medium text-foreground">Aucune photo pour le moment.</p>
              <p className="text-sm">Publiez une photo pour l&apos;afficher sur le site vitrine.</p>
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
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent p-2 pt-6 opacity-0 transition-opacity group-hover:opacity-100">
                    <p className="truncate text-xs font-medium text-white">{photo.filename}</p>
                    <p className="truncate text-[11px] text-white/75">
                      {GALLERY_PHOTO_CATEGORIES[photo.category]} · {formatSize(photo.size_bytes)}
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={<Button type="button" variant="secondary" size="icon-sm"
                        className="absolute right-2 top-2 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                        aria-label="Supprimer la photo" />}
                    >
                      <Trash2 className="size-4" />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer cette photo ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Elle disparaîtra immédiatement de la galerie du site vitrine. Action irréversible.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(photo.id)}>
                          Supprimer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}