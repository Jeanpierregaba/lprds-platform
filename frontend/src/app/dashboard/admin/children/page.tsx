'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Baby, Download, Eye, FileSpreadsheet, FileUp, Loader2, Plus, QrCode, UserCheck, UserX } from 'lucide-react'

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
import { organizationApi } from '@/lib/api/organization.api'
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

const PAGE_SIZE = 20
const ALL = '__all__'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR')
}

function downloadBlob(blob: Blob, fallbackName: string, disposition?: string) {
  const match = /filename="([^"]+)"/.exec(disposition ?? '')
  const filename = match?.[1] ?? fallbackName
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function ChildrenListPage() {
  const queryClient = useQueryClient()
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('children:write')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [departmentId, setDepartmentId] = useState<string>(ALL)
  const [sectionId, setSectionId] = useState<string>(ALL)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [skip, setSkip] = useState(0)
  const [view, setView] = useState<ViewMode>('cards')
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [loadingTemplate, setLoadingTemplate] = useState(false)
  const [importReport, setImportReport] = useState<ChildImportReportResponse | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => setSkip(0), [debouncedSearch, departmentId, sectionId, includeInactive])
  useEffect(() => setSectionId(ALL), [departmentId])

  const { data: departments } = useQuery({
    queryKey: ['departments', { includeInactive: false }],
    queryFn: () => organizationApi.listDepartments(false).then((r) => r.data),
  })

  const { data: sections } = useQuery({
    queryKey: ['sections', { departmentId, includeInactive: false }],
    queryFn: () =>
      organizationApi
        .listSections({ department_id: departmentId === ALL ? undefined : departmentId, include_inactive: false })
        .then((r) => r.data),
  })

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
      downloadBlob(res.data as Blob, 'modele_enfants.xlsx', res.headers['content-disposition'])
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
      downloadBlob(res.data as Blob, 'enfants.xlsx', res.headers['content-disposition'])
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
        title="Enfants"
        description="Gérer les fiches des enfants de votre établissement."
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
              Modèle
            </Button>
            )}
            <Button type="button" variant="outline" onClick={exportChildren} disabled={exporting}>
              {exporting ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Download className="mr-1.5 size-4" />}
              Exporter
            </Button>
            {canWrite && (
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <FileUp className="mr-1.5 size-4" />}
              Importer
            </Button>
            )}
            {canWrite && (
            <Button render={<Link href="/dashboard/admin/children/new" />}>
              <Plus className="mr-1.5 size-4" />
              Nouvelle fiche
            </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <SearchInput
          placeholder="Rechercher par nom, prénoms ou matricule..."
          value={search}
          onChange={setSearch}
        />
        <Select
          items={{ [ALL]: 'Tous les départements', ...Object.fromEntries((departments ?? []).map((d) => [d.id, d.name])) }}
          value={departmentId}
          onValueChange={(v) => setDepartmentId(v ?? ALL)}
        >
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Tous les départements" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les départements</SelectItem>
            {departments?.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={{ [ALL]: 'Toutes les sections', ...Object.fromEntries((sections ?? []).map((s) => [s.id, s.name])) }}
          value={sectionId}
          onValueChange={(v) => setSectionId(v ?? ALL)}
        >
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Toutes les sections" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toutes les sections</SelectItem>
            {sections?.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <InactiveSwitch
          id="include-inactive"
          checked={includeInactive}
          onCheckedChange={setIncludeInactive}
          label="Inclure les fiches inactives"
        />

        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === 'cards' ? (
        <ChildrenCardGrid
          items={items}
          isLoading={isLoading}
          hasSearch={!!debouncedSearch}
        />
      ) : (
      <DataTable>
        <DataTableHead>
          <Th>Matricule</Th>
          <Th>Nom</Th>
          <Th>Naissance</Th>
          <Th>Département</Th>
          <Th>Section</Th>
          <Th>Statut</Th>
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
                    {debouncedSearch ? 'Aucun résultat pour cette recherche.' : 'Aucune fiche enfant pour le moment.'}
                  </p>
                  <p className="max-w-sm text-sm">
                    {debouncedSearch
                      ? 'Essayez un autre nom, prénom ou matricule.'
                      : 'Créez la première fiche pour commencer à gérer les enfants.'}
                  </p>
                  {!debouncedSearch && canWrite && (
                    <Button render={<Link href="/dashboard/admin/children/new" />} size="sm" className="mt-1">
                      <Plus className="mr-1.5 size-4" />
                      Nouvelle fiche
                    </Button>
                  )}
                </div>
              </Td>
            </TableRow>
          ) : (
            items.map((child) => (
              <TableRow key={child.id} className={cn(!child.is_active && 'opacity-70')}>
                <Td>
                  <Link href={`/dashboard/admin/children/${child.id}`} className="block font-mono text-xs">
                    {child.matricule}
                  </Link>
                </Td>
                <Td>
                  <Link href={`/dashboard/admin/children/${child.id}`} className="block font-medium">
                    {child.first_names} {child.last_name}
                  </Link>
                </Td>
                <Td>
                  <Link href={`/dashboard/admin/children/${child.id}`} className="block text-muted-foreground">
                    {formatDate(child.birth_date)}
                  </Link>
                </Td>
                <Td>
                  <Link href={`/dashboard/admin/children/${child.id}`} className="block text-muted-foreground">
                    {child.department?.name ?? '—'}
                  </Link>
                </Td>
                <Td>
                  <Link href={`/dashboard/admin/children/${child.id}`} className="block text-muted-foreground">
                    {child.section?.name ?? '—'}
                  </Link>
                </Td>
                <Td>
                  <Link href={`/dashboard/admin/children/${child.id}`} className="block">
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
        label={<>{total} enfant{total > 1 ? 's' : ''} {isFetching && !isLoading && '· actualisation...'}</>}
        skip={skip}
        pageSize={PAGE_SIZE}
        total={total}
        onSkipChange={setSkip}
      />

      <Dialog open={!!importReport} onOpenChange={(open) => !open && setImportReport(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import des fiches enfants</DialogTitle>
            <DialogDescription>
              {importReport?.crees ?? 0} créée(s) · {importReport?.mis_a_jour ?? 0} mise(s) à jour ·{' '}
              {importReport?.rejetees ?? 0} rejetée(s)
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {importReport?.lignes.length ? (
              importReport.lignes.map((row) => (
                <div key={row.ligne} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={row.statut === 'rejeté' ? 'destructive' : row.statut === 'créé' ? 'default' : 'secondary'}
                      className="shrink-0"
                    >
                      {row.statut}
                    </Badge>
                    <span className="text-muted-foreground">Ligne {row.ligne}</span>
                    {row.matricule && <span className="font-mono text-xs">{row.matricule}</span>}
                  </div>
                  {row.erreur && <p className="mt-1 text-destructive">{row.erreur}</p>}
                  {row.avertissements.map((warning) => (
                    <p key={warning} className="mt-1 text-muted-foreground">⚠ {warning}</p>
                  ))}
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">Aucune ligne traitée.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </PageMotion>
  )
}

function ChildrenCardGrid({
  items, isLoading, hasSearch,
}: { items: ChildListItem[]; isLoading: boolean; hasSearch: boolean }) {
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
        title={hasSearch ? 'Aucun résultat pour cette recherche.' : 'Aucune fiche enfant pour le moment.'}
      />
    )
  }

  return (
    <CardsGrid>
      {items.map((child, i) => (
        <StaggerItem key={child.id} index={i}>
          <ChildCard child={child} canArchive={canArchive} canQr={canQr} />
        </StaggerItem>
      ))}
    </CardsGrid>
  )
}

function childAgeLabel(birthIso: string): string {
  const birth = new Date(birthIso)
  const now = new Date()
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth())
  if (now.getDate() < birth.getDate()) months -= 1
  if (months < 1) {
    const days = Math.max(0, Math.floor((now.getTime() - birth.getTime()) / 86400000))
    return `${days} jour${days > 1 ? 's' : ''}`
  }
  const years = Math.floor(months / 12)
  const rest = months % 12
  if (years === 0) return `${months} mois`
  return rest === 0 ? `${years} an${years > 1 ? 's' : ''}` : `${years} an${years > 1 ? 's' : ''} ${rest} mois`
}

function ChildCard({
  child, canArchive, canQr,
}: {
  child: ChildListItem
  canArchive: boolean
  canQr: boolean
}) {
  const queryClient = useQueryClient()
  const detailHref = `/dashboard/admin/children/${child.id}`
  const [qrOpen, setQrOpen] = useState(false)
  const [confirmToggle, setConfirmToggle] = useState(false)

  const toggleMutation = useMutation({
    mutationFn: () => childrenApi.setStatus(child.id, !child.is_active),
    onSuccess: () => {
      toast.success(child.is_active ? 'Fiche désactivée.' : 'Fiche réactivée.')
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
        label={`Ouvrir la fiche de ${child.first_names} ${child.last_name}`}
        inactive={!child.is_active}
      >
      <CardContent className="space-y-1.5 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 break-words font-display text-xl font-semibold leading-tight">
            {child.first_names} {child.last_name}
          </p>
          <StatusPill active={child.is_active} shrink />
        </div>
        <p className="text-sm text-muted-foreground">
          Code: <span className="font-mono">{child.matricule}</span>
        </p>
        <p className="text-sm">
          <span className="font-medium">Âge:</span> {childAgeLabel(child.birth_date)}
        </p>
        <p className="text-sm">
          <span className="font-medium">Section:</span>{' '}
          {child.section?.name ?? child.department?.name ?? '—'}
        </p>

        <div className="flex flex-wrap gap-2 pt-3">
          <Button variant="outline" size="sm" className="rounded-xl bg-accent" render={<Link href={`/dashboard/admin/children/${child.id}`} />}>
            <Eye className="mr-1.5 size-4" />
            Voir
          </Button>
          {canQr && (
            <Button variant="outline" size="sm" className="rounded-xl bg-accent" onClick={(e) => { e.stopPropagation(); setQrOpen(true) }}>
              <QrCode className="mr-1.5 size-4" />
              QR Code
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
                Désactiver
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="rounded-xl" onClick={(e) => { e.stopPropagation(); toggleMutation.mutate() }} disabled={toggleMutation.isPending}>
                <UserCheck className="mr-1.5 size-4" />
                Réactiver
              </Button>
            )
          )}
        </div>
      </CardContent>
      </ClickableCard>

      <QrBadgeDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        title={`Badge de ${child.first_names}`}
        subtitle={child.matricule}
        qrImage={qr?.qr_image}
        loading={loadingQr}
      />

      <ConfirmDialog
        open={confirmToggle}
        onOpenChange={setConfirmToggle}
        title="Désactiver cette fiche ?"
        description={`${child.first_names} ${child.last_name} ne comptera plus parmi les enfants actifs (réversible depuis sa fiche).`}
        confirmLabel="Désactiver"
        onConfirm={() => {
          setConfirmToggle(false)
          toggleMutation.mutate()
        }}
      />
    </>
  )
}
