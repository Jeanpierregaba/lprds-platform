'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlarmClock, Baby, ChevronLeft, ChevronRight, Search, UserRound, UserCheck, Users, UserX,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { attendanceApi } from '@/lib/api/attendance.api'
import { organizationApi } from '@/lib/api/organization.api'
import { StatusBadge } from './status-badge'
import type { DailyStatusValue } from '@/types/attendance'

const ALL = '__all__'
const PAGE_SIZE = 15
const MODAL_PAGE_SIZE = 8

type StatKey = 'total' | 'present' | 'absent' | 'late'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function formatTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function matchesStat(status: DailyStatusValue, key: StatKey) {
  switch (key) {
    case 'present': return status === 'present'
    case 'absent': return status === 'absent'
    case 'late': return status === 'late'
    default: return true
  }
}

/** Recherche nom/prénom insensible à la casse et aux accents. */
function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function DashboardTab() {
  const [date, setDate] = useState(todayIso())

  return (
    <div className="space-y-4 pt-2">
      <div className="w-full space-y-1.5 sm:w-fit">
        <Label htmlFor="attendance-date" className="text-white font-semibold text-sm">Date</Label>
        <Input id="attendance-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full sm:w-44" />
      </div>

      <Tabs defaultValue="children">
        <TabsList>
          <TabsTrigger value="children">
            <Baby className="mr-1.5 size-4" />
            Enfants
          </TabsTrigger>
          <TabsTrigger value="staff">
            <UserRound className="mr-1.5 size-4" />
            Personnel
          </TabsTrigger>
        </TabsList>

        <TabsContent value="children">
          <ChildrenDaily date={date} />
        </TabsContent>
        <TabsContent value="staff">
          <StaffDaily date={date} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ── Blocs partagés : 4 cards stats cliquables + pagination + modale ──

interface StatCounts {
  total: number
  present: number
  absent: number
  late: number
}

const STAT_DEFS: { key: StatKey; label: string; icon: typeof Users }[] = [
  { key: 'total', label: 'Total', icon: Users },
  { key: 'present', label: 'Présents', icon: UserCheck },
  { key: 'absent', label: 'Absents', icon: UserX },
  { key: 'late', label: 'En retard', icon: AlarmClock },
]

function StatCards({
  counts, totalLabel, onSelect,
}: {
  counts: StatCounts
  totalLabel: string
  onSelect: (key: StatKey) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {STAT_DEFS.map(({ key, label, icon: Icon }) => (
        <button key={key} type="button" onClick={() => onSelect(key)} className="text-left">
          <Card className="transition hover:border-primary/50 hover:shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                <Icon className="size-5 text-muted-foreground" />
              </span>
              <span>
                <span className="block text-2xl font-bold leading-none">{counts[key]}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {key === 'total' ? totalLabel : label}
                </span>
              </span>
            </CardContent>
          </Card>
        </button>
      ))}
    </div>
  )
}

function StatusModal({
  open, onClose, title, subtitle, children,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>
        <div className="-mx-1 overflow-y-auto px-1">{children}</div>
      </DialogContent>
    </Dialog>
  )
}

function PaginationControls({
  page, pageCount, onChange,
}: {
  page: number
  pageCount: number
  onChange: (page: number) => void
}) {
  if (pageCount <= 1) return null
  return (
    <div className="flex items-center justify-end gap-2 px-2 py-3">
      <span className="text-sm text-muted-foreground">
        Page {page} sur {pageCount}
      </span>
      <Button
        type="button" variant="outline" size="icon" className="size-8"
        disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Page précédente"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Button
        type="button" variant="outline" size="icon" className="size-8"
        disabled={page >= pageCount} onClick={() => onChange(page + 1)} aria-label="Page suivante"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )
}

function ModalPersonRow({ name, status, arrival }: { name: string; status: DailyStatusValue; arrival: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border py-2 last:border-0">
      <span className="min-w-0 truncate text-sm font-medium">{name}</span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-xs text-muted-foreground">{formatTime(arrival)}</span>
        <StatusBadge status={status} />
      </span>
    </div>
  )
}

const STAT_TITLES: Record<StatKey, string> = {
  total: 'Liste complète',
  present: 'Présents',
  absent: 'Absents',
  late: 'En retard',
}

function ChildrenDaily({ date }: { date: string }) {
  const [departmentId, setDepartmentId] = useState<string>(ALL)
  const [sectionId, setSectionId] = useState<string>(ALL)

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

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'daily', 'children', { date, departmentId, sectionId }],
    queryFn: () =>
      attendanceApi
        .getChildrenDaily({
          date,
          department_id: departmentId === ALL ? undefined : departmentId,
          section_id: sectionId === ALL ? undefined : sectionId,
        })
        .then((r) => r.data),
  })

  const items = data?.items ?? []

  const counts = useMemo<StatCounts>(() => ({
    total: data?.total ?? items.length,
    present: items.filter((i) => i.status === 'present').length,
    absent: items.filter((i) => i.status === 'absent').length,
    late: items.filter((i) => i.status === 'late').length,
  }), [data?.total, items])

  // Pagination (15 lignes/page) + modale par statut.
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState<StatKey | null>(null)
  const [modalPage, setModalPage] = useState(1)
  const [search, setSearch] = useState('')
  useEffect(() => { setPage(1); setModal(null); setModalPage(1) }, [date, departmentId, sectionId, search])

  // La recherche ne filtre que le tableau (retrouver vite une ligne) : les
  // cards et les modales portent toujours sur l'ensemble du jour.
  const visibleItems = useMemo(() => {
    const q = normalizeName(search.trim())
    if (!q) return items
    return items.filter((i) =>
      normalizeName(`${i.child.first_names} ${i.child.last_name}`).includes(q)
    )
  }, [items, search])

  const pageCount = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageItems = visibleItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const modalItems = modal ? items.filter((i) => matchesStat(i.status, modal)) : []
  const modalPageCount = Math.max(1, Math.ceil(modalItems.length / MODAL_PAGE_SIZE))
  const safeModalPage = Math.min(modalPage, modalPageCount)
  const modalPageItems = modalItems.slice(
    (safeModalPage - 1) * MODAL_PAGE_SIZE, safeModalPage * MODAL_PAGE_SIZE
  )

  const openModal = (key: StatKey) => { setModal(key); setModalPage(1) }

  return (
    <div className="space-y-4 pt-2">
      <StatCards counts={counts} totalLabel="Enfants actifs" onSelect={openModal} />

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Rechercher un enfant (nom, prénom)…"
            aria-label="Rechercher un enfant"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
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
            {departments?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
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
            {sections?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Enfant</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Arrivée</TableHead>
                <TableHead>Départ</TableHead>
                <TableHead>Retard</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                  </TableRow>
                ))
              ) : visibleItems.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="h-40 text-center text-muted-foreground">
                    {search.trim() ? 'Aucun enfant ne correspond à cette recherche.' : 'Aucune donnée pour cette date.'}
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((item) => (
                  <TableRow key={item.child.id}>
                    <TableCell className="font-medium">
                      {item.child.first_names} {item.child.last_name}
                    </TableCell>
                    <TableCell><StatusBadge status={item.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{formatTime(item.arrival_time)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatTime(item.departure_time)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.late_minutes != null ? `${item.late_minutes} min` : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <PaginationControls page={safePage} pageCount={pageCount} onChange={setPage} />
        </CardContent>
      </Card>

      <StatusModal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal ? `${STAT_TITLES[modal]} — enfants` : ''}
        subtitle={modal ? `${modalItems.length} enfant${modalItems.length > 1 ? 's' : ''}` : ''}
      >
        {modalItems.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun enfant dans cette catégorie.</p>
        ) : (
          <>
            {modalPageItems.map((item) => (
              <ModalPersonRow
                key={item.child.id}
                name={`${item.child.first_names} ${item.child.last_name}`}
                status={item.status}
                arrival={item.arrival_time}
              />
            ))}
            <PaginationControls page={safeModalPage} pageCount={modalPageCount} onChange={setModalPage} />
          </>
        )}
      </StatusModal>
    </div>
  )
}

function StaffDaily({ date }: { date: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'daily', 'staff', { date }],
    queryFn: () => attendanceApi.getStaffDaily({ date }).then((r) => r.data),
  })

  const items = data?.items ?? []

  const counts = useMemo<StatCounts>(() => ({
    total: data?.total ?? items.length,
    present: items.filter((i) => i.status === 'present').length,
    absent: items.filter((i) => i.status === 'absent').length,
    late: items.filter((i) => i.status === 'late').length,
  }), [data?.total, items])

  // Pagination (15 lignes/page) + modale par statut.
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState<StatKey | null>(null)
  const [modalPage, setModalPage] = useState(1)
  const [search, setSearch] = useState('')
  useEffect(() => { setPage(1); setModal(null); setModalPage(1) }, [date, search])

  // La recherche ne filtre que le tableau : cards et modales portent sur l'ensemble du jour.
  const visibleItems = useMemo(() => {
    const q = normalizeName(search.trim())
    if (!q) return items
    return items.filter((i) =>
      normalizeName(
        `${i.staff.nickname ?? ''} ${i.staff.first_name ?? ''} ${i.staff.last_name}`
      ).includes(q)
    )
  }, [items, search])

  const pageCount = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageItems = visibleItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const modalItems = modal ? items.filter((i) => matchesStat(i.status, modal)) : []
  const modalPageCount = Math.max(1, Math.ceil(modalItems.length / MODAL_PAGE_SIZE))
  const safeModalPage = Math.min(modalPage, modalPageCount)
  const modalPageItems = modalItems.slice(
    (safeModalPage - 1) * MODAL_PAGE_SIZE, safeModalPage * MODAL_PAGE_SIZE
  )

  const openModal = (key: StatKey) => { setModal(key); setModalPage(1) }

  return (
    <div className="space-y-4 pt-2">
      <StatCards counts={counts} totalLabel="Personnel actif" onSelect={openModal} />

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Rechercher (nom, prénom, surnom)…"
            aria-label="Rechercher un membre du personnel"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Personnel</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Arrivée</TableHead>
                <TableHead>Départ</TableHead>
                <TableHead>Retard</TableHead>
                <TableHead>Cantine</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                  </TableRow>
                ))
              ) : visibleItems.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="h-40 text-center text-muted-foreground">
                    {search.trim() ? 'Aucun membre ne correspond à cette recherche.' : 'Aucune donnée pour cette date.'}
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((item) => (
                  <TableRow key={item.staff.id}>
                    <TableCell className="font-medium">
                      {item.staff.nickname || `${item.staff.first_name} ${item.staff.last_name}`}
                    </TableCell>
                    <TableCell><StatusBadge status={item.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{formatTime(item.arrival_time)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatTime(item.departure_time)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.late_minutes != null ? `${item.late_minutes} min` : '—'}
                    </TableCell>
                    <TableCell>
                      {item.meal_taken ? <Badge variant="default">Oui</Badge> : <Badge variant="outline">Non</Badge>}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <PaginationControls page={safePage} pageCount={pageCount} onChange={setPage} />
        </CardContent>
      </Card>

      <StatusModal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal ? `${STAT_TITLES[modal]} — personnel` : ''}
        subtitle={modal ? `${modalItems.length} personne${modalItems.length > 1 ? 's' : ''}` : ''}
      >
        {modalItems.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucune personne dans cette catégorie.</p>
        ) : (
          <>
            {modalPageItems.map((item) => (
              <ModalPersonRow
                key={item.staff.id}
                name={item.staff.nickname || `${item.staff.first_name} ${item.staff.last_name}`}
                status={item.status}
                arrival={item.arrival_time}
              />
            ))}
            <PaginationControls page={safeModalPage} pageCount={modalPageCount} onChange={setModalPage} />
          </>
        )}
      </StatusModal>
    </div>
  )
}
