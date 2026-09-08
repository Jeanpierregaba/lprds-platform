'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { FileText, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { reportsApi } from '@/lib/api/reports.api'
import { REPORT_STATUS_LABELS, REPORT_TYPE_LABELS, type ReportStatus, type ReportType } from '@/types/reports'

const PAGE_SIZE = 20
const ALL = '__all__'

const STATUS_BADGE_VARIANT: Record<ReportStatus, 'default' | 'outline' | 'destructive' | 'secondary'> = {
  draft: 'outline',
  submitted: 'secondary',
  rejected: 'destructive',
  validated: 'default',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR')
}

export function ReportsListTab() {
  const [status, setStatus] = useState<string>(ALL)
  const [reportType, setReportType] = useState<string>(ALL)
  const [skip, setSkip] = useState(0)

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
            <SelectTrigger className="w-full sm:w-44">
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
            <SelectTrigger className="w-full sm:w-44">
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

        <Button render={<Link href="/dashboard/admin/reports/new" />}>
          <Plus className="mr-1.5 size-4" />
          Nouveau rapport
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Enfant</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Période</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Auteur</TableHead>
                <TableHead>Mis à jour</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
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
                    <TableCell className="p-0">
                      <Link href={`/dashboard/admin/reports/${r.id}`} className="block p-2 font-medium">
                        {r.child.first_names} {r.child.last_name}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/admin/reports/${r.id}`} className="block p-2 text-muted-foreground">
                        {REPORT_TYPE_LABELS[r.report_type]}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/admin/reports/${r.id}`} className="block p-2 text-muted-foreground">
                        {r.period_label}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/admin/reports/${r.id}`} className="block p-2">
                        <Badge variant={STATUS_BADGE_VARIANT[r.status]}>{REPORT_STATUS_LABELS[r.status]}</Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/admin/reports/${r.id}`} className="block p-2 text-muted-foreground">
                        {r.created_by.nickname || `${r.created_by.first_name} ${r.created_by.last_name}`}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/admin/reports/${r.id}`} className="block p-2 text-muted-foreground">
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
