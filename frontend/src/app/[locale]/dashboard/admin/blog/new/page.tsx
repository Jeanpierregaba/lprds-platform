'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { blogApi } from '@/lib/api/blog.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { BackLink, PageMotion } from '@/components/dashboard/shared/page'
import { useRouter } from '@/i18n/navigation'

const NO_TAG = '__no_tag__'

export default function NewArticlePage() {
  const t = useTranslations('blog')
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tagId, setTagId] = useState(NO_TAG)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: tags } = useQuery({
    queryKey: ['blog', 'tags'],
    queryFn: () => blogApi.listTags().then((r) => r.data.items),
  })

  const tagItems = { [NO_TAG]: t('form.noTag'), ...Object.fromEntries((tags ?? []).map((t) => [t.id, t.name])) }

  const canSubmit = title.trim().length > 0 && content.trim().length > 0

  const onCreate = async () => {
    setIsSubmitting(true)
    try {
      const res = await blogApi.create({
        title: title.trim(),
        content: content.trim(),
        tag_id: tagId === NO_TAG ? null : tagId,
      })
      toast.success(t('form.created'))
      router.push(`/dashboard/admin/blog/${res.data.id}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <PageMotion className="mx-auto max-w-2xl space-y-4">
      <BackLink href="/dashboard/admin/blog" label={t('form.back')} />

      <Card>
        <CardHeader>
          <CardTitle>{t('form.newTitle')}</CardTitle>
          <CardDescription>
            {t('form.newHint')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">{t('form.title')}</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('form.titlePlaceholder')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tag">{t('form.tag')}</Label>
            <Select items={tagItems} value={tagId} onValueChange={(v) => setTagId(v ?? NO_TAG)}>
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
            <Textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} rows={10} placeholder={t('form.contentPlaceholder')} />
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={onCreate} disabled={!canSubmit || isSubmitting}>
              {isSubmitting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {t('form.createDraft')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageMotion>
  )
}
