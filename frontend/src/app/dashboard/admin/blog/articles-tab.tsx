'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Newspaper, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { blogApi } from '@/lib/api/blog.api'
import { AuthMedia } from './auth-media'
import { ARTICLE_STATUS_LABELS, type ArticleStatus } from '@/types/blog'

const PAGE_SIZE = 20
const ALL = '__all__'

const STATUS_BADGE_VARIANT: Record<ArticleStatus, 'default' | 'outline'> = {
  draft: 'outline',
  published: 'default',
}

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('fr-FR') : '—'
}

export function ArticlesTab() {
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
            <SelectTrigger className="w-44">
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
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Toutes les étiquettes" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(tagItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Switch id="include-inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} />
            <Label htmlFor="include-inactive" className="text-sm text-white font-semibold">Inclure les supprimés</Label>
          </div>
        </div>

        <Button render={<Link href="/dashboard/admin/blog/new" />}>
          <Plus className="mr-1.5 size-4" />
          Nouvel article
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Image</TableHead>
                <TableHead>Titre</TableHead>
                <TableHead>Étiquette</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Publié le</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="size-10 rounded" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <Newspaper className="size-5" />
                      </div>
                      <p className="font-medium text-foreground">Aucun article pour le moment.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((article) => (
                  <TableRow key={article.id} className={!article.is_active ? 'opacity-50' : undefined}>
                    <TableCell>
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
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/dashboard/admin/blog/${article.id}`} className="hover:underline">
                        {article.title}
                      </Link>
                      {!article.is_active && <span className="ml-2 text-xs text-muted-foreground">(supprimé)</span>}
                    </TableCell>
                    <TableCell>{article.tag ? <Badge variant="outline">{article.tag.name}</Badge> : '—'}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[article.status]}>{ARTICLE_STATUS_LABELS[article.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(article.published_at)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" render={<Link href={`/dashboard/admin/blog/${article.id}`} />}>
                        Voir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
