'use client'

import { useTranslations } from 'next-intl'

import { useRef, useState } from 'react'
import { intlLocale } from '@/lib/utils/locale-format'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Baby, Download, Eye, FileSpreadsheet, FileUp, Loader2, Plus, QrCode, UserCheck, UserX, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableBody, TableRow } from '@/components/ui/table'
import { CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { childrenApi } from '@/lib/api/children.api'
import { attendanceApi } from '@/lib/api/attendance.api'
import { useDirectoryUnits } from '@/lib/hooks/use-directory'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { cn } from '@/lib/utils'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { InactiveSwitch, SearchInput, ViewToggle, type ViewMode } from '@/components/dashboard/shared/filters'
import { DataTable, DataTableHead, TableSkeletonRows, Td, Th } from '@/components/dashboard/shared/table'
import { CardsEmptyState, CardsGrid, CardsSkeleton, ClickableCard, StaggerItem, StatusPill } from '@/components/dashboard/shared/cards'
import { ListPagination } from '@/components/dashboard/shared/pagination'
import { ConfirmDialog, QrBadgeDialog } from '@/components/dashboard/shared/dialogs'
import type { ChildImportReportResponse, ChildListItem } from '@/types/children'
import { Link } from '@/i18n/navigation'
import { ChildAvatar } from '@/components/children/child-avatar'
import { useListParams, useUrlSearch } from '@/lib/hooks/use-list-params'
import { downloadBlob, filenameFromDisposition } from '@/lib/utils/download'
import { CHILDREN_LIST_PATH } from '../list-paths'

const PAGE_SIZE = 20
const ALL = '__all__'

/** Les filtres vivent dans l'URL : ouvrir une fiche puis revenir en arrière
 *  doit retrouver cet écran, pas une liste remise à zéro. Constante de module —
 *  son identité sert de dépendance au hook. */
const LIST_DEFAULTS = {
  q: '',
  dept: ALL,
  section: ALL,
  inactive: false,
  skip: 0,
  view: 'cards' as ViewMode,
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(intlLocale())
}

export default function ChildrenListPage() {
  const t = useTranslations('children')
  const queryClient = useQueryClient()
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('children:write')
  const { params, setParams, setFilter, detailHref } = useListParams(CHILDREN_LIST_PATH, LIST_DEFAULTS)
  const { dept: departmentId, section: sectionId, inactive: includeInactive, skip, view } = params
  const debouncedSearch = params.q
  const [search, setSearch] = useUrlSearch(params.q, (q) => setFilter({ q }))
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [loadingTemplate, setLoadingTemplate] = useState(false)
  const [importReport, setImportReport] = useState<ChildImportReportResponse | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ⚠️ Sélecteurs de périmètre : l'ANNUAIRE. `/departments` et `/sections`
  // exigent `organization:read` — un staff porteur de `children:read` seul
  // voyait des filtres vides, sans rien qui l'explique.
  const { departments, sectionsOf } = useDirectoryUnits()

  const sections = sectionsOf(departmentId === ALL ? null : departmentId)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['children', { search: debouncedSearch, departmentId, sectionId, includeInactive, skip }],
    queryFn: () =>
      childrenApi
        .list({
          search: debouncedSearch || undefined,
          department_id: departmentId === ALL ? undefined : departmentId,
          section_id: sectionId === ALL ? undefined : sectionId,
          include_inactive: includeInactive,
          skip,
          limit: PAGE_SIZE,
        })
        .then((r) => r.data),
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []

  const downloadTemplate = async () => {
    setLoadingTemplate(true)
    try {
      const res = await childrenApi.importTemplate('xlsx')
      downloadBlob(res.data as Blob, filenameFromDisposition(res.headers['content-disposition'], 'modele_enfants.xlsx'))
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setLoadingTemplate(false)
    }
  }

  const exportChildren = async () => {
    setExporting(true)
    try {
      const res = await childrenApi.export({ file_format: 'xlsx', include_inactive: includeInactive })
      downloadBlob(res.data as Blob, filenameFromDisposition(res.headers['content-disposition'], 'enfants.xlsx'))
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  const onFileSelected = async (file: File | undefined) => {
    if (!file) return
    setImporting(true)
    try {
      const res = await childrenApi.import(file)
      setImportReport(res.data)
      queryClient.invalidateQueries({ queryKey: ['children'] })
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <PageMotion className="space-y-6">
      <PageHeader
        title={t('list.title')}
        description={t('list.description')}
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={(e) => onFileSelected(e.target.files?.[0])}
            />
            {canWrite && (
            <Button type="button" variant="outline" onClick={downloadTemplate} disabled={loadingTemplate}>
              {loadingTemplate ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <FileSpreadsheet className="mr-1.5 size-4" />}
              {t('list.template')}
            </Button>
            )}
            <Button type="button" variant="outline" onClick={exportChildren} disabled={exporting}>
              {exporting ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Download className="mr-1.5 size-4" />}
              {t('list.export')}
            </Button>
            {canWrite && (
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <FileUp className="mr-1.5 size-4" />}
              {t('list.import')}
            </Button>
            )}
            {/* Lisible par quiconque voit déjà les fiches : le trombinoscope
                ne montre rien de plus qu'une liste, en photos. */}
            <Button variant="outline" render={<Link href="/dashboard/admin/children/trombinoscope" />}>
              <Users className="mr-1.5 size-4" />
              {t('trombinoscope.open')}
            </Button>
            {canWrite && (
            <Button render={<Link href="/dashboard/admin/children/new" />}>
              <Plus className="mr-1.5 size-4" />
              {t('list.new')}
            </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <SearchInput
          placeholder={t('list.search')}
          value={search}
          onChange={setSearch}
        />
        <Select
          items={{ [ALL]: t('list.allDepartments'), ...Object.fromEntries((departments ?? []).map((d) => [d.id, d.name])) }}
          value={departmentId}
          /* Changer de département vide la section : les sections affichées
             sont celles du département, celle d'avant n'y est plus. */
          onValueChange={(v) => setFilter({ dept: v ?? ALL, section: ALL })}
        >
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder={t('list.allDepartments')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('list.allDepartments')}</SelectItem>
            {departments?.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={{ [ALL]: t('list.allSections'), ...Object.fromEntries((sections ?? []).map((s) => [s.id, s.name])) }}
          value={sectionId}
          onValueChange={(v) => setFilter({ section: v ?? ALL })}
        >
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder={t('list.allSections')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('list.allSections')}</SelectItem>
            {sections?.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <InactiveSwitch
          id="include-inactive"
          checked={includeInactive}
          onCheckedChange={(checked) => setFilter({ inactive: checked })}
          label={t('list.includeInactive')}
        />

        <ViewToggle view={view} onChange={(next) => setParams({ view: next })} />
      </div>

      {view === 'cards' ? (
        <ChildrenCardGrid
          items={items}
          isLoading={isLoading}
          hasSearch={!!debouncedSearch}
          detailHref={detailHref}
        />
      ) : (
      <DataTable>
        <DataTableHead>
          <Th>{t('list.columns.matricule')}</Th>
          <Th>{t('list.columns.name')}</Th>
          <Th>{t('list.columns.birth')}</Th>
          <Th>{t('list.columns.department')}</Th>
          <Th>{t('list.columns.section')}</Th>
          <Th>{t('list.columns.status')}</Th>
        </DataTableHead>
        <TableBody>
          {isLoading ? (
            <TableSkeletonRows
              widths={['h-4 w-20', 'h-4 w-40', 'h-4 w-24', 'h-4 w-28', 'h-4 w-28', 'h-5 w-14 rounded-full']}
            />
          ) : items.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <Td colSpan={6} className="h-56 text-center">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                    <Baby className="size-5" />
                  </div>
                  <p className="font-medium text-foreground">
                    {debouncedSearch ? t('list.emptySearch') : t('list.empty')}
                  </p>
                  <p className="max-w-sm text-sm">
                    {debouncedSearch
                      ? t('list.emptySearchHint')
                      : t('list.emptyHint')}
                  </p>
                  {!debouncedSearch && canWrite && (
                    <Button render={<Link href="/dashboard/admin/children/new" />} size="sm" className="mt-1">
                      <Plus className="mr-1.5 size-4" />
                      {t('list.new')}
                    </Button>
                  )}
                </div>
              </Td>
            </TableRow>
          ) : (
            items.map((child) => (
              <TableRow key={child.id} className={cn(!child.is_active && 'opacity-70')}>
                <Td>
                  <Link href={detailHref(child.id)} className="block font-mono text-xs">
                    {child.matricule}
                  </Link>
                </Td>
                <Td>
                  <Link href={detailHref(child.id)} className="flex items-center gap-2.5 font-medium">
                    <ChildAvatar
                      childId={child.id}
                      firstNames={child.first_names}
                      lastName={child.last_name}
                      hasPhoto={child.has_photo}
                      size="sm"
                    />
                    {child.first_names} {child.last_name}
                  </Link>
                </Td>
                <Td>
                  <Link href={detailHref(child.id)} className="block text-muted-foreground">
                    {formatDate(child.birth_date)}
                  </Link>
                </Td>
                <Td>
                  <Link href={detailHref(child.id)} className="block text-muted-foreground">
                    {child.department?.name ?? '—'}
                  </Link>
                </Td>
                <Td>
                  <Link href={detailHref(child.id)} className="block text-muted-foreground">
                    {child.section?.name ?? '—'}
                  </Link>
                </Td>
                <Td>
                  <Link href={detailHref(child.id)} className="block">
                    <StatusPill active={child.is_active} />
                  </Link>
                </Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </DataTable>
      )}

      <ListPagination
        label={<>{t('list.count', { count: total })} {isFetching && !isLoading && t('list.refreshing')}</>}
        skip={skip}
        pageSize={PAGE_SIZE}
        total={total}
        onSkipChange={(next) => setParams({ skip: next })}
      />

      <Dialog open={!!importReport} onOpenChange={(open) => !open && setImportReport(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('import.title')}</DialogTitle>
            <DialogDescription>
              {t('import.summary', {
                created: importReport?.crees ?? 0,
                updated: importReport?.mis_a_jour ?? 0,
                rejected: importReport?.rejetees ?? 0,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {importReport?.lignes.length ? (
              importReport.lignes.map((row) => (
                <div key={row.ligne} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={row.statut === 'rejected' ? 'destructive' : row.statut === 'created' ? 'default' : 'secondary'}
                      className="shrink-0"
                    >
                      {t(`import.status.${row.statut}`)}
                    </Badge>
                    <span className="text-muted-foreground">{t('import.line', { n: row.ligne })}</span>
                    {row.matricule && <span className="font-mono text-xs">{row.matricule}</span>}
                  </div>
                  {row.erreur && <p className="mt-1 text-destructive">{row.erreur}</p>}
                  {row.avertissements.map((warning) => (
                    <p key={warning} className="mt-1 text-muted-foreground">⚠ {warning}</p>
                  ))}
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">{t('import.noRows')}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </PageMotion>
  )
}

function ChildrenCardGrid({
  items, isLoading, hasSearch, detailHref,
}: { items: ChildListItem[]; isLoading: boolean; hasSearch: boolean; detailHref: (id: string) => string }) {
  const t = useTranslations('children')
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canArchive = user?.role === 'admin' || permissions.has('children:archive')
  const canQr = user?.role === 'admin' || permissions.has('attendance:write')

  if (isLoading) {
    return <CardsSkeleton />
  }

  if (items.length === 0) {
    return (
      <CardsEmptyState
        icon={Baby}
        title={hasSearch ? t('list.emptySearch') : t('list.empty')}
      />
    )
  }

  return (
    <CardsGrid>
      {items.map((child, i) => (
        <StaggerItem key={child.id} index={i}>
          <ChildCard child={child} canArchive={canArchive} canQr={canQr} detailHref={detailHref(child.id)} />
        </StaggerItem>
      ))}
    </CardsGrid>
  )
}

/** Âge lisible. Les accords (« 1 an » / « 2 ans ») passent par les règles de
 *  pluriel ICU du catalogue : elles diffèrent d'une langue à l'autre et n'ont
 *  rien à faire dans le code. */
function childAgeLabel(
  birthIso: string,
  t: (k: string, v?: Record<string, string | number | Date>) => string,
): string {
  const birth = new Date(birthIso)
  const now = new Date()
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth())
  if (now.getDate() < birth.getDate()) months -= 1
  if (months < 1) {
    const days = Math.max(0, Math.floor((now.getTime() - birth.getTime()) / 86400000))
    return t('card.ageDays', { count: days })
  }
  const years = Math.floor(months / 12)
  const rest = months % 12
  if (years === 0) return t('card.ageMonths', { count: months })
  return rest === 0
    ? t('card.ageYears', { count: years })
    : t('card.ageYearsMonths', { years, months: rest })
}

function ChildCard({
  child, canArchive, canQr, detailHref,
}: {
  child: ChildListItem
  canArchive: boolean
  canQr: boolean
  detailHref: string
}) {
  const t = useTranslations('children')
  const queryClient = useQueryClient()
  const [qrOpen, setQrOpen] = useState(false)
  const [confirmToggle, setConfirmToggle] = useState(false)

  const toggleMutation = useMutation({
    mutationFn: () => childrenApi.setStatus(child.id, !child.is_active),
    onSuccess: () => {
      toast.success(child.is_active ? t('status.deactivated') : t('status.reactivated'))
      queryClient.invalidateQueries({ queryKey: ['children'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const { data: qr, isLoading: loadingQr } = useQuery({
    queryKey: ['attendance', 'qr-child', child.id],
    queryFn: () => attendanceApi.getChildQrcode(child.id).then((r) => r.data),
    enabled: qrOpen,
  })

  return (
    <>
      <ClickableCard
        href={detailHref}
        label={t('card.open', { name: `${child.first_names} ${child.last_name}` })}
        inactive={!child.is_active}
      >
      <CardContent className="space-y-1.5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <ChildAvatar
              childId={child.id}
              firstNames={child.first_names}
              lastName={child.last_name}
              hasPhoto={child.has_photo}
              size="md"
            />
            <p className="min-w-0 break-words font-display text-xl font-semibold leading-tight">
              {child.first_names} {child.last_name}
            </p>
          </div>
          <StatusPill active={child.is_active} shrink />
        </div>
        <p className="text-sm text-muted-foreground">
          {t('card.code')} <span className="font-mono">{child.matricule}</span>
        </p>
        <p className="text-sm">
          <span className="font-medium">{t('card.age')}</span> {childAgeLabel(child.birth_date, t)}
        </p>
        <p className="text-sm">
          <span className="font-medium">{t('card.section')}</span>{' '}
          {child.section?.name ?? child.department?.name ?? '—'}
        </p>

        <div className="flex flex-wrap gap-2 pt-3">
          <Button variant="outline" size="sm" className="rounded-xl bg-accent" render={<Link href={detailHref} />}>
            <Eye className="mr-1.5 size-4" />
            {t('card.view')}
          </Button>
          {canQr && (
            <Button variant="outline" size="sm" className="rounded-xl bg-accent" onClick={(e) => { e.stopPropagation(); setQrOpen(true) }}>
              <QrCode className="mr-1.5 size-4" />
              {t('card.qrCode')}
            </Button>
          )}
          {canArchive && (
            child.is_active ? (
              <Button
                size="sm"
                className="rounded-xl bg-warning text-warning-foreground hover:brightness-95"
                onClick={(e) => { e.stopPropagation(); setConfirmToggle(true) }}
              >
                <UserX className="mr-1.5 size-4" />
                {t('status.deactivate')}
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="rounded-xl" onClick={(e) => { e.stopPropagation(); toggleMutation.mutate() }} disabled={toggleMutation.isPending}>
                <UserCheck className="mr-1.5 size-4" />
                {t('status.reactivate')}
              </Button>
            )
          )}
        </div>
      </CardContent>
      </ClickableCard>

      <QrBadgeDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        title={t('card.badge', { name: child.first_names })}
        subtitle={child.matricule}
        qrImage={qr?.qr_image}
        loading={loadingQr}
      />

      <ConfirmDialog
        open={confirmToggle}
        onOpenChange={setConfirmToggle}
        title={t('status.confirmTitle')}
        description={t('status.confirmBody', { name: `${child.first_names} ${child.last_name}` })}
        confirmLabel={t('status.deactivate')}
        onConfirm={() => {
          setConfirmToggle(false)
          toggleMutation.mutate()
        }}
      />
    </>
  )
}
