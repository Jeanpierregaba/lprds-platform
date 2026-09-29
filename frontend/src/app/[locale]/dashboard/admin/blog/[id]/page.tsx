'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useRef, useState } from 'react'
import { intlLocale } from '@/lib/utils/locale-format'
import { useLabel } from '@/lib/i18n/labels'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ImagePlus, Loader2, Send, Trash2, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { blogApi } from '@/lib/api/blog.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { downloadBlob } from '@/lib/utils/download'
import { BackLink } from '@/components/dashboard/shared/page'
import { ConfirmDialog } from '@/components/dashboard/shared/dialogs'
import { AuthMedia } from '../auth-media'
import { useRouter } from '@/i18n/navigation'

const NO_TAG = '__no_tag__'

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ArticleDetailPage() {
  const t = useTranslations('blog')
  const articleStatusLabel = useLabel('articleStatus')
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const coverInputRef = useRef<HTMLInputElement>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tagId, setTagId] = useState(NO_TAG)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: article, isLoading } = useQuery({
    queryKey: ['blog', 'article', id],
    queryFn: () => blogApi.get(id).then((r) => r.data),
  })

  const { data: tags } = useQuery({
    queryKey: ['blog', 'tags'],
    queryFn: () => blogApi.listTags().then((r) => r.data.items),
  })

  useEffect(() => {
    if (!article) return
    setTitle(article.title)
    setContent(article.content)
    setTagId(article.tag?.id ?? NO_TAG)
  }, [article?.id])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['blog', 'article', id] })
    queryClient.invalidateQueries({ queryKey: ['blog', 'articles'] })
    queryClient.invalidateQueries({ queryKey: ['blog', 'cover-thumb', id] })
    queryClient.invalidateQueries({ queryKey: ['blog', 'cover', id] })
  }

  const saveMutation = useMutation({
    mutationFn: () => blogApi.update(id, {
      title: title.trim(),
      content: content.trim(),
      tag_id: tagId === NO_TAG ? null : tagId,
    }),
    onSuccess: () => { toast.success(t('form.saved')); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const publishMutation = useMutation({
    mutationFn: () => blogApi.publish(id),
    onSuccess: () => { toast.success(t('form.published')); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => blogApi.remove(id),
    onSuccess: () => {
      toast.success(t('form.deleted'))
      router.push('/dashboard/admin/blog')
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const coverMutation = useMutation({
    mutationFn: (file: File) => blogApi.setCover(id, file),
    onSuccess: () => { toast.success(t('form.coverUpdated')); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const uploadMediaMutation = useMutation({
    mutationFn: (file: File) => blogApi.uploadAttachment(id, file),
    onSuccess: () => { toast.success(t('form.mediaAdded')); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const deleteMediaMutation = useMutation({
    mutationFn: (attachmentId: string) => blogApi.deleteAttachment(id, attachmentId),
    onSuccess: () => { toast.success(t('form.mediaDeleted')); invalidate() },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!article) {
    return <p className="text-muted-foreground">Article introuvable.</p>
  }

  const isEditable = article.is_active
  const canPublish = article.status === 'draft' && !!article.cover_url && !!article.tag
  const tagItems = { [NO_TAG]: t('form.noTag'), ...Object.fromEntries((tags ?? []).map((t) => [t.id, t.name])) }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <BackLink href="/dashboard/admin/blog" label={t('form.back')} />

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>{article.title}</CardTitle>
              <CardDescription>
                Créé par {article.created_by.nickname || `${article.created_by.first_name} ${article.created_by.last_name}`} · {formatDateTime(article.created_at)}
              </CardDescription>
            </div>
            <Badge variant={article.status === 'published' ? 'default' : 'outline'}>
              {articleStatusLabel(article.status)}
            </Badge>
          </div>
        </CardHeader>
        {!article.is_active && (
          <CardContent className="text-sm text-destructive">
            Cet article a été supprimé (soft delete) — lecture seule.
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('form.coverTitle')}</CardTitle>
          <CardDescription>{t('form.coverHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {article.cover_url ? (
            <AuthMedia
              queryKey={['blog', 'cover', id]}
              fetchBlob={() => blogApi.downloadCover(id).then((r) => r.data)}
              contentType="image/*"
              alt={article.title}
              className="h-48 w-full rounded-md object-cover"
            />
          ) : (
            <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
              Aucune image à la une
            </div>
          )}
          {isEditable && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => coverInputRef.current?.click()}
                disabled={coverMutation.isPending}
              >
                {coverMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <ImagePlus className="mr-1.5 size-4" />}
                {article.cover_url ? t('form.replace') : t('form.addImage')}
              </Button>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) coverMutation.mutate(file)
                  e.target.value = ''
                }}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('form.content')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">{t('form.title')}</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!isEditable} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tag">{t('form.tag')}</Label>
            <Select items={tagItems} value={tagId} onValueChange={(v) => setTagId(v ?? NO_TAG)} disabled={!isEditable}>
              <SelectTrigger id="tag" className="w-full">
                <SelectValue placeholder={t('form.noTag')} />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(tagItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="content">{t('form.content')}</Label>
            <Textarea id="content" rows={10} value={content} onChange={(e) => setContent(e.target.value)} disabled={!isEditable} />
          </div>

          {isEditable && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !title.trim() || !content.trim()}
              >
                {saveMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                {t('form.save')}
              </Button>

              {article.status === 'draft' && (
                <Button
                  type="button"
                  onClick={() => publishMutation.mutate()}
                  disabled={!canPublish || publishMutation.isPending}
                  title={!canPublish ? t('form.cannotPublish') : undefined}
                >
                  {publishMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Send className="mr-1.5 size-4" />}
                  {t('form.publish')}
                </Button>
              )}

              <Button type="button" variant="destructive" className="ml-auto" onClick={() => setConfirmDelete(true)}>
                {t('form.delete')}
              </Button>
              <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title={t('form.deleteTitle')}
                description={t('form.deleteBody')}
                confirmLabel={t('form.delete')}
                onConfirm={() => {
                  setConfirmDelete(false)
                  deleteMutation.mutate()
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('form.mediaTitle')}</CardTitle>
          <CardDescription>{t('form.mediaHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {article.attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun média.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {article.attachments.map((att) => (
                <div key={att.id} className="group relative aspect-square overflow-hidden rounded-md ring-1 ring-border">
                  <button
                    type="button"
                    className="size-full"
                    onClick={async () => {
                      try {
                        const res = await blogApi.downloadAttachment(id, att.id)
                        downloadBlob(res.data, att.filename)
                      } catch (err) {
                        toast.error(getApiErrorMessage(err))
                      }
                    }}
                  >
                    <AuthMedia
                      queryKey={['blog', 'media-thumb', att.id]}
                      fetchBlob={() => blogApi.downloadAttachment(id, att.id).then((r) => r.data)}
                      contentType={att.content_type}
                      alt={att.filename}
                      className="size-full"
                    />
                  </button>
                  {isEditable && (
                    <button
                      type="button"
                      onClick={() => deleteMediaMutation.mutate(att.id)}
                      disabled={deleteMediaMutation.isPending}
                      className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                      aria-label={t('form.deleteMedia')}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {isEditable && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => mediaInputRef.current?.click()}
                disabled={uploadMediaMutation.isPending}
              >
                {uploadMediaMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Upload className="mr-1.5 size-4" />}
                {t('form.addMedia')}
              </Button>
              <input
                ref={mediaInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) uploadMediaMutation.mutate(file)
                  e.target.value = ''
                }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
