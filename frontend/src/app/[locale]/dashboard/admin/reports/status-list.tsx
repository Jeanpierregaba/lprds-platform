'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Eye, FileText, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { TableBody, TableRow } from '@/components/ui/table'
import { reportsApi } from '@/lib/api/reports.api'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { cn } from '@/lib/utils/cn'
import { SearchInput, ViewToggle, type ViewMode } from '@/components/dashboard/shared/filters'
import { DataTable, DataTableHead, TableSkeletonRows, Td, Th } from '@/components/dashboard/shared/table'
import { CardsEmptyState, CardsGrid, CardsSkeleton, ClickableCard, StaggerItem } from '@/components/dashboard/shared/cards'
import { ListPagination } from '@/components/dashboard/shared/pagination'
import { REPORT_STATUS_BADGE_CLASS, REPORT_STATUS_LABELS, REPORT_TYPE_LABELS, type ReportListItem, type ReportStatus, type ReportType } from '@/types/reports'
import { Link } from '@/i18n/navigation'

const PAGE_SIZE = 20

const REPORT_TYPE_PILLS: Record<ReportType, string> = {
  quotidien: 'bg-sky text-white',
  bi_mensuel: 'bg-teal text-white',
  annuel: 'bg-navy text-white',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR')
}

/** Liste paginée pour UN type et UN statut fixés (l'onglet parent porte les pills). */
export function StatusList({ reportType, status }: { reportType: ReportType; status: ReportStatus }) {
  const user = useUser()
  const { permissions } = useMyPermissions()
  // La page est partagée admin/staff : l'éducatrice sans reports:write
  // (lecture seule) ne voit pas le bouton de création.
  const canWrite = user?.role === 'admin' || permissions.has('reports:write')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [skip, setSkip] = useState(0)
  const [view, setView] = useState<ViewMode>('cards')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => setSkip(0), [status, reportType, debouncedSearch])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['reports', 'list', { status, reportType, search: debouncedSearch, skip }],
    queryFn: () =>
      reportsApi
        .list({
          status,
          report_type: reportType,
          search: debouncedSearch || undefined,
          skip,
          limit: PAGE_SIZE,
        })
        .then((r) => r.data),
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          placeholder="Rechercher par nom, prénoms ou matricule..."
          value={search}
          onChange={setSearch}
          inputClassName="h-9"
        />

        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          {canWrite && (
            <Button render={<Link href="/dashboard/admin/reports/new" />}>
              <Plus className="mr-1.5 size-4" />
              Nouveau rapport
            </Button>
          )}
        </div>
      </div>

      {view === 'cards' ? (
        <ReportsCardGrid items={items} isLoading={isLoading} />
      ) : (
        <DataTable>
          <DataTableHead>
            <Th>Enfant</Th>
            <Th>Type</Th>
            <Th>Période</Th>
            <Th>Statut</Th>
            <Th>Auteur</Th>
            <Th>Mis à jour</Th>
          </DataTableHead>
          <TableBody>
            {isLoading ? (
              <TableSkeletonRows
                widths={['h-4 w-32', 'h-5 w-20 rounded-full', 'h-4 w-28', 'h-5 w-16 rounded-full', 'h-4 w-24', 'h-4 w-20']}
              />
            ) : items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <Td colSpan={6} className="h-56 text-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                      <FileText className="size-5" />
                    </div>
                    <p className="font-medium text-foreground">Aucun rapport {REPORT_STATUS_LABELS[status].toLowerCase()}.</p>
                  </div>
                </Td>
              </TableRow>
            ) : (
              items.map((r) => (
                <TableRow key={r.id}>
                  <Td className="font-medium">
                    <Link href={`/dashboard/admin/reports/${r.id}`} className="block">
                      {r.child.first_names} {r.child.last_name}
                    </Link>
                  </Td>
                  <Td>
                    <Link href={`/dashboard/admin/reports/${r.id}`} className="block">
                      <span className={cn('inline-block rounded-full px-3 py-1 text-xs font-semibold', REPORT_TYPE_PILLS[r.report_type])}>
                        {REPORT_TYPE_LABELS[r.report_type]}
                      </span>
                    </Link>
                  </Td>
                  <Td className="text-muted-foreground">
                    <Link href={`/dashboard/admin/reports/${r.id}`} className="block">
                      {r.period_label}
                    </Link>
                  </Td>
                  <Td>
                    <Link href={`/dashboard/admin/reports/${r.id}`} className="block">
                      <span className={cn('inline-block rounded-full px-3 py-1 text-xs font-semibold', REPORT_STATUS_BADGE_CLASS[r.status])}>
                        {REPORT_STATUS_LABELS[r.status]}
                      </span>
                    </Link>
                  </Td>
                  <Td className="text-muted-foreground">
                    <Link href={`/dashboard/admin/reports/${r.id}`} className="block">
                      {r.created_by.nickname || `${r.created_by.first_name} ${r.created_by.last_name}`}
                    </Link>
                  </Td>
                  <Td className="text-muted-foreground">
                    <Link href={`/dashboard/admin/reports/${r.id}`} className="block">
                      {formatDate(r.updated_at)}
                    </Link>
                  </Td>
                </TableRow>
              ))
            )}
          </TableBody>
        </DataTable>
      )}

      <ListPagination
        label={<>{total} rapport{total > 1 ? 's' : ''} {isFetching && !isLoading && '· actualisation...'}</>}
        skip={skip}
        pageSize={PAGE_SIZE}
        total={total}
        onSkipChange={setSkip}
      />
    </div>
  )
}

function ReportsCardGrid({
  items, isLoading,
}: { items: ReportListItem[]; isLoading: boolean }) {
  if (isLoading) {
    return <CardsSkeleton />
  }

  if (items.length === 0) {
    return (
      <CardsEmptyState icon={FileText} title="Aucun rapport pour ce statut." />
    )
  }

  return (
    <CardsGrid>
      {items.map((r, i) => (
        <StaggerItem key={r.id} index={i}>
          <ClickableCard
            href={`/dashboard/admin/reports/${r.id}`}
            label={`Ouvrir le rapport de ${r.child.first_names} ${r.child.last_name}`}
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
          </ClickableCard>
        </StaggerItem>
      ))}
    </CardsGrid>
  )
}
