'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useState } from 'react'
import { intlLocale } from '@/lib/utils/locale-format'
import { useLabel, useLabelMap } from '@/lib/i18n/labels'
import { useQuery } from '@tanstack/react-query'
import { Newspaper, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableBody, TableRow } from '@/components/ui/table'
import { blogApi } from '@/lib/api/blog.api'
import { cn } from '@/lib/utils/cn'
import { InactiveSwitch } from '@/components/dashboard/shared/filters'
import { DataTable, DataTableHead, TableSkeletonRows, Td, Th } from '@/components/dashboard/shared/table'
import { AuthMedia } from '@/components/media/auth-media'
import { ARTICLE_STATUSES, type ArticleStatus } from '@/types/blog'
import { Link, useRouter } from '@/i18n/navigation'

const PAGE_SIZE = 20
const ALL = '__all__'

const STATUS_PILLS: Record<ArticleStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  published: 'bg-pale-green text-white',
}

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(intlLocale()) : '—'
}

export function ArticlesTab() {
  const t = useTranslations('blog')
  const tCommon = useTranslations('common')
  const articleStatusLabel = useLabel('articleStatus')
  const articleStatusLabels = useLabelMap('articleStatus', ARTICLE_STATUSES)
  const router = useRouter()
  const [status, setStatus] = useState<string>(ALL)
  const [tagId, setTagId] = useState<string>(ALL)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [skip, setSkip] = useState(0)

  useEffect(() => setSkip(0), [status, tagId, includeInactive])

  const { data: tags } = useQuery({
    queryKey: ['blog', 'tags'],
    queryFn: () => blogApi.listTags().then((r) => r.data.items),
  })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['blog', 'articles', { status, tagId, includeInactive, skip }],
    queryFn: () =>
      blogApi
        .list({
          status: status === ALL ? undefined : (status as ArticleStatus),
          tag_id: tagId === ALL ? undefined : tagId,
          include_inactive: includeInactive,
          skip,
          limit: PAGE_SIZE,
        })
        .then((r) => r.data),
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []
  const hasNext = skip + PAGE_SIZE < total
  const hasPrev = skip > 0

  const tagItems = { [ALL]: t('articles.allTags'), ...Object.fromEntries((tags ?? []).map((t) => [t.id, t.name])) }

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <Select
            items={{ [ALL]: t('articles.allStatuses'), ...articleStatusLabels }}
            value={status}
            onValueChange={(v) => setStatus(v ?? ALL)}
          >
            <SelectTrigger className="h-9 w-full sm:w-44">
              <SelectValue placeholder={t('articles.allStatuses')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('articles.allStatuses')}</SelectItem>
              {Object.entries(articleStatusLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select items={tagItems} value={tagId} onValueChange={(v) => setTagId(v ?? ALL)}>
            <SelectTrigger className="h-9 w-full sm:w-44">
              <SelectValue placeholder={t('articles.allTags')} />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(tagItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <InactiveSwitch
            id="include-inactive"
            checked={includeInactive}
            onCheckedChange={setIncludeInactive}
            label={t('articles.includeDeleted')}
          />
        </div>

        <Button render={<Link href="/dashboard/admin/blog/new" />}>
          <Plus className="mr-1.5 size-4" />
          {t('articles.new')}
        </Button>
      </div>

      <DataTable>
        <DataTableHead>
          <Th className="w-16">{t('articles.columns.image')}</Th>
          <Th>{t('articles.columns.title')}</Th>
          <Th>{t('articles.columns.tag')}</Th>
          <Th>{t('articles.columns.status')}</Th>
          <Th>{t('articles.columns.publishedAt')}</Th>
          <Th />
        </DataTableHead>
        <TableBody>
          {isLoading ? (
            <TableSkeletonRows
              widths={['size-10 rounded', 'h-4 w-48', 'h-5 w-24 rounded-full', 'h-5 w-20 rounded-full', 'h-4 w-24', '']}
            />
          ) : items.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <Td colSpan={6} className="h-48 text-center">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                    <Newspaper className="size-5" />
                  </div>
                  <p className="font-medium text-foreground">{t('articles.empty')}</p>
                </div>
              </Td>
            </TableRow>
          ) : (
            items.map((article) => (
              <TableRow
                key={article.id}
                className={!article.is_active ? 'cursor-pointer opacity-50' : 'cursor-pointer'}
                onClick={() => router.push(`/dashboard/admin/blog/${article.id}`)}
                title={t('articles.open')}
              >
                <Td>
                  {article.cover_url ? (
                    <AuthMedia
                      queryKey={['blog', 'cover-thumb', article.id]}
                      fetchBlob={() => blogApi.downloadCover(article.id, true).then((r) => r.data)}
                      contentType="image/*"
                      alt={article.title}
                      className="size-10 rounded object-cover"
                    />
                  ) : (
                    <div className="flex size-10 items-center justify-center rounded bg-muted text-muted-foreground">
                      <Newspaper className="size-4" />
                    </div>
                  )}
                </Td>
                <Td className="font-medium">
                  {article.title}
                  {!article.is_active && <span className="ml-2 text-xs font-normal text-muted-foreground">{t('articles.deletedSuffix')}</span>}
                </Td>
                <Td>
                  {article.tag ? (
                    <span className="inline-block rounded-full bg-teal px-3 py-1 text-xs font-semibold text-white">
                      {article.tag.name}
                    </span>
                  ) : '—'}
                </Td>
                <Td>
                  <span className={cn('inline-block rounded-full px-3 py-1 text-xs font-semibold', STATUS_PILLS[article.status])}>
                    {articleStatusLabel(article.status)}
                  </span>
                </Td>
                <Td className="text-muted-foreground">{formatDate(article.published_at)}</Td>
                <Td>
                  <Button variant="ghost" size="sm" render={<Link href={`/dashboard/admin/blog/${article.id}`} />}>
                    {t('articles.view')}
                  </Button>
                </Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </DataTable>

      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{t('articles.count', { count: total })}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!hasPrev || isFetching} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>
              {tCommon('actions.previous')}
            </Button>
            <Button variant="outline" size="sm" disabled={!hasNext || isFetching} onClick={() => setSkip(skip + PAGE_SIZE)}>
              {tCommon('actions.next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
