'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Eye, FileText, LayoutGrid, List, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { reportsApi } from '@/lib/api/reports.api'
import { cn } from '@/lib/utils/cn'
import { REPORT_STATUS_BADGE_CLASS, REPORT_STATUS_LABELS, REPORT_TYPE_LABELS, type ReportListItem, type ReportStatus, type ReportType } from '@/types/reports'

const PAGE_SIZE = 20
const ALL = '__all__'

const REPORT_TYPE_PILLS: Record<ReportType, string> = {
  quotidien: 'bg-sky text-white',
  bi_mensuel: 'bg-teal text-white',
  annuel: 'bg-navy text-white',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR')
}

export function ReportsListTab() {
  const [status, setStatus] = useState<string>(ALL)
  const [reportType, setReportType] = useState<string>(ALL)
  const [skip, setSkip] = useState(0)
  const [view, setView] = useState<'table' | 'cards'>('cards')

  useEffect(() => setSkip(0), [status, reportType])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['reports', 'list', { status, reportType, skip }],
    queryFn: () =>
      reportsApi
        .list({
          status: status === ALL ? undefined : (status as ReportStatus),
          report_type: reportType === ALL ? undefined : (reportType as ReportType),
          skip,
          limit: PAGE_SIZE,
        })
        .then((r) => r.data),
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []
  const hasNext = skip + PAGE_SIZE < total
  const hasPrev = skip > 0

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <Select
            items={{ [ALL]: 'Tous les statuts', ...REPORT_STATUS_LABELS }}
            value={status}
            onValueChange={(v) => setStatus(v ?? ALL)}
          >
            <SelectTrigger className="h-9 w-full sm:w-44">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tous les statuts</SelectItem>
              {Object.entries(REPORT_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={{ [ALL]: 'Tous les types', ...REPORT_TYPE_LABELS }}
            value={reportType}
            onValueChange={(v) => setReportType(v ?? ALL)}
          >
            <SelectTrigger className="h-9 w-full sm:w-44">
              <SelectValue placeholder="Tous les types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tous les types</SelectItem>
              {Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border bg-accent p-0.5">
            <Button
              type="button"
              variant={view === 'table' ? 'default' : 'ghost'}
              size="icon-sm"
              aria-label="Vue en liste"
              aria-pressed={view === 'table'}
              onClick={() => setView('table')}
            >
              <List className="size-4" />
            </Button>
            <Button
              type="button"
              variant={view === 'cards' ? 'default' : 'ghost'}
              size="icon-sm"
              aria-label="Vue en cartes"
              aria-pressed={view === 'cards'}
              onClick={() => setView('cards')}
            >
              <LayoutGrid className="size-4" />
            </Button>
          </div>
          <Button render={<Link href="/dashboard/admin/reports/new" />}>
            <Plus className="mr-1.5 size-4" />
            Nouveau rapport
          </Button>
        </div>
      </div>

      {view === 'cards' ? (
        <ReportsCardGrid items={items} isLoading={isLoading} />
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <Table className="border-collapse">
              <TableHeader className="bg-primary [&_tr]:border-transparent">
                <TableRow className="bg-primary hover:bg-primary">
                  <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Enfant</TableHead>
                  <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Type</TableHead>
                  <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Période</TableHead>
                  <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Statut</TableHead>
                  <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Auteur</TableHead>
                  <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Mis à jour</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="px-5 py-4"><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell className="px-5 py-4"><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                      <TableCell className="px-5 py-4"><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell className="px-5 py-4"><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                      <TableCell className="px-5 py-4"><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="px-5 py-4"><Skeleton className="h-4 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="h-56 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                          <FileText className="size-5" />
                        </div>
                        <p className="font-medium text-foreground">Aucun rapport pour ces filtres.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="px-5 py-4 font-medium">
                        <Link href={`/dashboard/admin/reports/${r.id}`} className="block">
                          {r.child.first_names} {r.child.last_name}
                        </Link>
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <Link href={`/dashboard/admin/reports/${r.id}`} className="block">
                          <span className={cn('inline-block rounded-full px-3 py-1 text-xs font-semibold', REPORT_TYPE_PILLS[r.report_type])}>
                            {REPORT_TYPE_LABELS[r.report_type]}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="px-5 py-4 text-muted-foreground">
                        <Link href={`/dashboard/admin/reports/${r.id}`} className="block">
                          {r.period_label}
                        </Link>
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <Link href={`/dashboard/admin/reports/${r.id}`} className="block">
                          <span className={cn('inline-block rounded-full px-3 py-1 text-xs font-semibold', REPORT_STATUS_BADGE_CLASS[r.status])}>
                            {REPORT_STATUS_LABELS[r.status]}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="px-5 py-4 text-muted-foreground">
                        <Link href={`/dashboard/admin/reports/${r.id}`} className="block">
                          {r.created_by.nickname || `${r.created_by.first_name} ${r.created_by.last_name}`}
                        </Link>
                      </TableCell>
                      <TableCell className="px-5 py-4 text-muted-foreground">
                        <Link href={`/dashboard/admin/reports/${r.id}`} className="block">
                          {formatDate(r.updated_at)}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} rapport{total > 1 ? 's' : ''} {isFetching && !isLoading && '· actualisation...'}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>
            Précédent
          </Button>
          <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setSkip(skip + PAGE_SIZE)}>
            Suivant
          </Button>
        </div>
      </div>
    </div>
  )
}

function ReportsCardGrid({
  items, isLoading,
}: { items: ReportListItem[]; isLoading: boolean }) {
  const router = useRouter()
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-2 p-5">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-56 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <FileText className="size-5" />
          </div>
          <p className="font-medium text-foreground">Aucun rapport pour ces filtres.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((r, i) => (
        <motion.div
          key={r.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.05 }}
        >
          <Card
            className="cursor-pointer rounded-2xl shadow-soft transition hover:-translate-y-0.5"
            onClick={() => router.push(`/dashboard/admin/reports/${r.id}`)}
            onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/dashboard/admin/reports/${r.id}`) }}
            tabIndex={0}
            role="link"
            aria-label={`Ouvrir le rapport de ${r.child.first_names} ${r.child.last_name}`}
          >
            <CardContent className="space-y-1.5 p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="font-display text-xl font-semibold leading-tight">
                  {r.child.first_names} {r.child.last_name}
                </p>
                <span className={cn('shrink-0 rounded-full px-3 py-1 text-xs font-semibold', REPORT_STATUS_BADGE_CLASS[r.status])}>
                  {REPORT_STATUS_LABELS[r.status]}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('inline-block rounded-full px-3 py-1 text-xs font-semibold', REPORT_TYPE_PILLS[r.report_type])}>
                  {REPORT_TYPE_LABELS[r.report_type]}
                </span>
                <span className="text-sm text-muted-foreground">{r.period_label}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Par {r.created_by.nickname || `${r.created_by.first_name} ${r.created_by.last_name}`} · mis à jour le {formatDate(r.updated_at)}
              </p>
              <div className="flex flex-wrap gap-2 pt-3">
                <Button variant="outline" size="sm" className="rounded-xl bg-accent" render={<Link href={`/dashboard/admin/reports/${r.id}`} />}>
                  <Eye className="mr-1.5 size-4" />
                  Ouvrir
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}
