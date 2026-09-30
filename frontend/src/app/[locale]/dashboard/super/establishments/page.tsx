'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Search, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { establishmentsApi } from '@/lib/api/establishments.api'
import { Link } from '@/i18n/navigation'

const PAGE_SIZE = 20

export default function EstablishmentsListPage() {
  const t = useTranslations('admin')
  const tCommon = useTranslations('common')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [skip, setSkip] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => setSkip(0), [debouncedSearch, includeInactive])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['establishments', { search: debouncedSearch, includeInactive, skip }],
    queryFn: () =>
      establishmentsApi
        .list({ search: debouncedSearch || undefined, include_inactive: includeInactive, skip, limit: PAGE_SIZE })
        .then((r) => r.data),
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []
  const hasNext = skip + PAGE_SIZE < total
  const hasPrev = skip > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('establishments.title')}</h1>
          <p className="text-muted-foreground">{t('establishments.description')}</p>
        </div>
        <Button render={<Link href="/dashboard/super/establishments/new" />}>
          <Plus className="mr-1.5 size-4" />
          {t('establishments.new')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('establishments.search')}
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="include-inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} />
          <Label htmlFor="include-inactive" className="text-sm">{t('establishments.includeInactive')}</Label>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('establishments.columns.code')}</TableHead>
                <TableHead>{t('establishments.columns.name')}</TableHead>
                <TableHead>{t('establishments.columns.email')}</TableHead>
                <TableHead>{t('establishments.columns.phone')}</TableHead>
                <TableHead>{t('establishments.columns.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="h-56 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <Building2 className="size-5" />
                      </div>
                      <p className="font-medium text-foreground">
                        {debouncedSearch ? t('establishments.emptySearch') : t('establishments.empty')}
                      </p>
                      <p className="max-w-sm text-sm">
                        {debouncedSearch
                          ? t('establishments.emptySearchHint')
                          : t('establishments.emptyHint')}
                      </p>
                      {!debouncedSearch && (
                        <Button render={<Link href="/dashboard/super/establishments/new" />} size="sm" className="mt-1">
                          <Plus className="mr-1.5 size-4" />
                          {t('establishments.new')}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/super/establishments/${e.id}`} className="block p-2 font-mono text-xs">
                        {e.code}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/super/establishments/${e.id}`} className="block p-2 font-medium">
                        {e.name}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/super/establishments/${e.id}`} className="block p-2 text-muted-foreground">
                        {e.email}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/super/establishments/${e.id}`} className="block p-2 text-muted-foreground">
                        {e.phone}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/super/establishments/${e.id}`} className="block p-2">
                        <Badge variant={e.is_active ? 'default' : 'outline'}>
                          {e.is_active ? t('establishments.activeLabel') : t('establishments.inactiveLabel')}
                        </Badge>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {t('establishments.count', { count: total })} {isFetching && !isLoading && `· ${tCommon('states.refreshing')}`}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>
            {tCommon('actions.previous')}
          </Button>
          <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setSkip(skip + PAGE_SIZE)}>
            {tCommon('actions.next')}
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
