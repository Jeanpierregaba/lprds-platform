'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Baby, Download, Eye, FileSpreadsheet, FileUp, LayoutGrid, List, Loader2, Plus, QrCode, Search, UserCheck, UserX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { childrenApi } from '@/lib/api/children.api'
import { attendanceApi } from '@/lib/api/attendance.api'
import { organizationApi } from '@/lib/api/organization.api'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { cn } from '@/lib/utils'
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
  const [view, setView] = useState<'table' | 'cards'>('cards')
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
  const hasNext = skip + PAGE_SIZE < total
  const hasPrev = skip > 0

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
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Enfants</h1>
          <p className="text-muted-foreground">Gérer les fiches des enfants de votre établissement.</p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, prénoms ou matricule..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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
        <div className="flex items-center gap-2">
          <Switch id="include-inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} />
          <Label htmlFor="include-inactive" className="text-sm text-white font-semibold">Inclure les fiches inactives</Label>
        </div>

        <div className="ml-auto flex items-center gap-1 rounded-md border border-border p-0.5 bg-accent">
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
      </div>

      {view === 'cards' ? (
        <ChildrenCardGrid
          items={items}
          isLoading={isLoading}
          hasSearch={!!debouncedSearch}
        />
      ) : (
      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          <Table className="border-collapse">
            <TableHeader className="bg-primary [&_tr]:border-transparent">
              <TableRow className="bg-primary hover:bg-primary">
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Matricule</TableHead>
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Nom</TableHead>
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Naissance</TableHead>
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Département</TableHead>
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Section</TableHead>
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-4 py-3.5"><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell className="px-4 py-3.5"><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell className="px-4 py-3.5"><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="px-4 py-3.5"><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell className="px-4 py-3.5"><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell className="px-4 py-3.5"><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="h-56 text-center">
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
                  </TableCell>
                </TableRow>
              ) : (
                items.map((child) => (
                  <TableRow key={child.id} className={cn(!child.is_active && 'opacity-70')}>
                    <TableCell className="px-4 py-3.5">
                      <Link href={`/dashboard/admin/children/${child.id}`} className="block font-mono text-xs">
                        {child.matricule}
                      </Link>
                    </TableCell>
                    <TableCell className="px-4 py-3.5">
                      <Link href={`/dashboard/admin/children/${child.id}`} className="block font-medium">
                        {child.first_names} {child.last_name}
                      </Link>
                    </TableCell>
                    <TableCell className="px-4 py-3.5">
                      <Link href={`/dashboard/admin/children/${child.id}`} className="block text-muted-foreground">
                        {formatDate(child.birth_date)}
                      </Link>
                    </TableCell>
                    <TableCell className="px-4 py-3.5">
                      <Link href={`/dashboard/admin/children/${child.id}`} className="block text-muted-foreground">
                        {child.department?.name ?? '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="px-4 py-3.5">
                      <Link href={`/dashboard/admin/children/${child.id}`} className="block text-muted-foreground">
                        {child.section?.name ?? '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="px-4 py-3.5">
                      <Link href={`/dashboard/admin/children/${child.id}`} className="block">
                        <span
                          className={cn(
                            'inline-block rounded-full px-3 py-1 text-xs font-semibold',
                            child.is_active ? 'bg-pale-green text-white' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {child.is_active ? 'Actif' : 'Inactif'}
                        </span>
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
          {total} enfant{total > 1 ? 's' : ''} {isFetching && !isLoading && '· actualisation...'}
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
    </motion.div>
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
            <Baby className="size-5" />
          </div>
          <p className="font-medium text-foreground">
            {hasSearch ? 'Aucun résultat pour cette recherche.' : 'Aucune fiche enfant pour le moment.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((child, i) => (
        <motion.div
          key={child.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.05 }}
        >
          <ChildCard child={child} canArchive={canArchive} canQr={canQr} />
        </motion.div>
      ))}
    </div>
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
    <Card className={cn('rounded-2xl shadow-soft transition hover:-translate-y-0.5', !child.is_active && 'opacity-75')}>
      <CardContent className="space-y-1.5 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-xl font-semibold leading-tight">
            {child.first_names} {child.last_name}
          </p>
          <span
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
              child.is_active ? 'bg-pale-green text-white' : 'bg-muted text-muted-foreground',
            )}
          >
            {child.is_active ? 'Actif' : 'Inactif'}
          </span>
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
            <Button variant="outline" size="sm" className="rounded-xl bg-accent" onClick={() => setQrOpen(true)}>
              <QrCode className="mr-1.5 size-4" />
              QR Code
            </Button>
          )}
          {canArchive && (
            child.is_active ? (
              <Button
                size="sm"
                className="rounded-xl bg-warning text-warning-foreground hover:brightness-95"
                onClick={() => setConfirmToggle(true)}
              >
                <UserX className="mr-1.5 size-4" />
                Désactiver
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => toggleMutation.mutate()} disabled={toggleMutation.isPending}>
                <UserCheck className="mr-1.5 size-4" />
                Réactiver
              </Button>
            )
          )}
        </div>
      </CardContent>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="font-display">Badge de {child.first_names}</DialogTitle>
            <DialogDescription className="font-mono text-xs">{child.matricule}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-2">
            {loadingQr || !qr ? (
              <Skeleton className="size-48 rounded-xl" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr.qr_image} alt={`QR ${child.matricule}`} className="size-48 rounded-xl ring-1 ring-border" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmToggle} onOpenChange={setConfirmToggle}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Désactiver cette fiche ?</AlertDialogTitle>
            <AlertDialogDescription>
              {child.first_names} {child.last_name} ne comptera plus parmi les enfants actifs
              (réversible depuis sa fiche).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmToggle(false)
                toggleMutation.mutate()
              }}
            >
              Désactiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
