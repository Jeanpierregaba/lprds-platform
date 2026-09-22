'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Newspaper, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableBody, TableRow } from '@/components/ui/table'
import { blogApi } from '@/lib/api/blog.api'
import { cn } from '@/lib/utils/cn'
import { InactiveSwitch } from '@/components/dashboard/shared/filters'
import { DataTable, DataTableHead, TableSkeletonRows, Td, Th } from '@/components/dashboard/shared/table'
import { AuthMedia } from './auth-media'
import { ARTICLE_STATUS_LABELS, type ArticleStatus } from '@/types/blog'

const PAGE_SIZE = 20
const ALL = '__all__'

const STATUS_PILLS: Record<ArticleStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  published: 'bg-pale-green text-white',
}

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('fr-FR') : '—'
}

export function ArticlesTab() {
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

  const tagItems = { [ALL]: 'Toutes les étiquettes', ...Object.fromEntries((tags ?? []).map((t) => [t.id, t.name])) }

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <Select
            items={{ [ALL]: 'Tous les statuts', ...ARTICLE_STATUS_LABELS }}
            value={status}
            onValueChange={(v) => setStatus(v ?? ALL)}
          >
            <SelectTrigger className="h-9 w-full sm:w-44">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tous les statuts</SelectItem>
              {Object.entries(ARTICLE_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select items={tagItems} value={tagId} onValueChange={(v) => setTagId(v ?? ALL)}>
            <SelectTrigger className="h-9 w-full sm:w-44">
              <SelectValue placeholder="Toutes les étiquettes" />
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
            label="Inclure les supprimés"
          />
        </div>

        <Button render={<Link href="/dashboard/admin/blog/new" />}>
          <Plus className="mr-1.5 size-4" />
          Nouvel article
        </Button>
      </div>

      <DataTable>
        <DataTableHead>
          <Th className="w-16">Image</Th>
          <Th>Titre</Th>
          <Th>Étiquette</Th>
          <Th>Statut</Th>
          <Th>Publié le</Th>
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
                  <p className="font-medium text-foreground">Aucun article pour le moment.</p>
                </div>
              </Td>
            </TableRow>
          ) : (
            items.map((article) => (
              <TableRow
                key={article.id}
                className={!article.is_active ? 'cursor-pointer opacity-50' : 'cursor-pointer'}
                onClick={() => router.push(`/dashboard/admin/blog/${article.id}`)}
                title="Ouvrir cet article"
              >
                <Td>
                  {article.cover_url ? (
                    <AuthMedia
                      queryKey={['blog', 'cover-thumb', article.id]}
                      fetchBlob={() => blogApi.downloadCover(article.id).then((r) => r.data)}
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
                  {!article.is_active && <span className="ml-2 text-xs font-normal text-muted-foreground">(supprimé)</span>}
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
                    {ARTICLE_STATUS_LABELS[article.status]}
                  </span>
                </Td>
                <Td className="text-muted-foreground">{formatDate(article.published_at)}</Td>
                <Td>
                  <Button variant="ghost" size="sm" render={<Link href={`/dashboard/admin/blog/${article.id}`} />}>
                    Voir
                  </Button>
                </Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </DataTable>

      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} article{total > 1 ? 's' : ''}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!hasPrev || isFetching} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>
              Précédent
            </Button>
            <Button variant="outline" size="sm" disabled={!hasNext || isFetching} onClick={() => setSkip(skip + PAGE_SIZE)}>
              Suivant
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
