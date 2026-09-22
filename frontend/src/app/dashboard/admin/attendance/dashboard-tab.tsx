'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlarmClock, Baby, ChevronLeft, ChevronRight, Search, UserRound, UserCheck, Users, UserX,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Tabs } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableBody, TableRow } from '@/components/ui/table'
import { attendanceApi } from '@/lib/api/attendance.api'
import { organizationApi } from '@/lib/api/organization.api'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { cn } from '@/lib/utils/cn'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { DataTable, DataTableHead, TableSkeletonRows, Td, Th } from '@/components/dashboard/shared/table'
import { StatusBadge } from './status-badge'
import type { AttendanceEvent, DailyStatusValue, PersonType } from '@/types/attendance'

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

/** « HH:MM » depuis un ISO (pour pré-remplir les champs time), '' si absent. */
function toHHMM(iso: string | null) {
  if (!iso) return ''
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
  const user = useUser()
  const { permissions } = useMyPermissions()
  // Correction manuelle : admin d'office, ou staff porteur de attendance:write.
  const canCorrect = user?.role === 'admin' || permissions.has('attendance:write')

  return (
    <div className="space-y-4 pt-2">
      <div className="w-full space-y-1.5 sm:w-fit">
        <Label htmlFor="attendance-date" className="text-white font-semibold text-sm">Date</Label>
        <Input id="attendance-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full sm:w-44" />
      </div>

      <Tabs defaultValue="children">
        <PillsTabsList>
          <PillsTrigger value="children" active="primary" icon={Baby}>
            Enfants
          </PillsTrigger>
          <PillsTrigger value="staff" active="teal" icon={UserRound}>
            Personnel
          </PillsTrigger>
        </PillsTabsList>

        <TabPanel value="children">
          <ChildrenDaily date={date} canCorrect={canCorrect} />
        </TabPanel>
        <TabPanel value="staff">
          <StaffDaily date={date} canCorrect={canCorrect} />
        </TabPanel>
      </Tabs>
    </div>
  )
}

// ── Blocs partagés : 4 cards stats cliquables + pagination + modale ──

export function TabFade({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <motion.div
      key={value}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

interface StatCounts {
  total: number
  present: number
  absent: number
  late: number
}

// ── Correction manuelle des heures (lignes cliquables) ──────────
interface CorrectionTarget {
  personType: PersonType
  personId: string
  displayName: string
  initialArrival: string | null     // ISO du jour (1re arrivée), null si aucun scan
  initialDeparture: string | null   // ISO du jour (dernier départ), null si aucun scan
}

function CorrectionDialog({
  target, date, onClose,
}: {
  target: CorrectionTarget
  date: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const personFilter = target.personType === 'child'
    ? { child_id: target.personId }
    : { staff_id: target.personId }

  // Lignes du jour : la 1re arrivée et le dernier départ portent le statut
  // affiché (même règle que le calcul backend) — ce sont elles qu'on corrige.
  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'events', { personType: target.personType, personId: target.personId, date }],
    queryFn: () => attendanceApi.listEvents({
      person_type: target.personType, ...personFilter, date_from: date, date_to: date, limit: 100,
    }).then((r) => r.data),
  })
  const dayItems: AttendanceEvent[] = data?.items ?? []
  const arrivalEvent = dayItems
    .filter((e) => e.event_type === 'arrival')
    .sort((a, b) => a.scanned_at.localeCompare(b.scanned_at))[0]
  const departureEvent = dayItems
    .filter((e) => e.event_type === 'departure')
    .sort((a, b) => b.scanned_at.localeCompare(a.scanned_at))[0]

  const initialArrivalHHMM = toHHMM(target.initialArrival)
  const initialDepartureHHMM = toHHMM(target.initialDeparture)
  const [arrival, setArrival] = useState(initialArrivalHHMM)
  const [departure, setDeparture] = useState(initialDepartureHHMM)

  const arrivalDirty = arrival !== '' && arrival !== initialArrivalHHMM
  const departureDirty = departure !== '' && departure !== initialDepartureHHMM

  const save = useMutation({
    mutationFn: async () => {
      const ops: Promise<unknown>[] = []
      const personBody = target.personType === 'child'
        ? { child_id: target.personId }
        : { staff_id: target.personId }
      if (arrivalDirty) {
        ops.push(arrivalEvent
          ? attendanceApi.updateEvent(arrivalEvent.id, { scanned_at: `${date}T${arrival}` })
          : attendanceApi.createManualEvent({
              person_type: target.personType, ...personBody, event_type: 'arrival', date, time: arrival,
            }))
      }
      if (departureDirty) {
        ops.push(departureEvent
          ? attendanceApi.updateEvent(departureEvent.id, { scanned_at: `${date}T${departure}` })
          : attendanceApi.createManualEvent({
              person_type: target.personType, ...personBody, event_type: 'departure', date, time: departure,
            }))
      }
      await Promise.all(ops)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      toast.success('Heures corrigées.')
      onClose()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const prettyDate = new Date(`${date}T00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Corriger les heures</DialogTitle>
          <DialogDescription>
            {target.displayName} — {prettyDate}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="correct-arrival">Arrivée</Label>
              <Input
                id="correct-arrival"
                type="time"
                value={arrival}
                onChange={(e) => setArrival(e.target.value)}
              />
              {!arrivalEvent && (
                <p className="text-xs text-muted-foreground">Aucun scan — sera créé.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="correct-departure">Départ</Label>
              <Input
                id="correct-departure"
                type="time"
                value={departure}
                onChange={(e) => setDeparture(e.target.value)}
              />
              {!departureEvent && (
                <p className="text-xs text-muted-foreground">Aucun scan — sera créé.</p>
              )}
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Seules les heures modifiées sont enregistrées. Une heure sans scan crée
          la ligne correspondante.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!(arrivalDirty || departureDirty) || save.isPending || isLoading}
          >
            {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const STAT_DEFS: { key: StatKey; label: string; icon: typeof Users; tint: string }[] = [
  { key: 'total', label: 'Total', icon: Users, tint: 'bg-sky text-white' },
  { key: 'present', label: 'Présents', icon: UserCheck, tint: 'bg-pale-green text-white' },
  { key: 'absent', label: 'Absents', icon: UserX, tint: 'bg-destructive text-white' },
  { key: 'late', label: 'En retard', icon: AlarmClock, tint: 'bg-warning text-warning-foreground' },
]

function StatCards({
  counts, totalLabel, onSelect, selected,
}: {
  counts: StatCounts
  totalLabel: string
  onSelect: (key: StatKey) => void
  selected?: StatKey | null
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {STAT_DEFS.map(({ key, label, icon: Icon, tint }, i) => (
        <motion.button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className="text-left"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: i * 0.06 }}
        >
          <Card
            className={cn(
              'relative overflow-hidden transition hover:-translate-y-0.5 hover:shadow-soft',
              selected === key && 'ring-2 ring-primary',
            )}
          >
            <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-1.5', tint)} />
            <CardContent className="flex items-center gap-3 p-4 pt-5">
              <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl shadow-sm', tint)}>
                <Icon className="size-5" />
              </span>
              <span>
                <span className="block font-display text-2xl font-semibold leading-none">{counts[key]}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {key === 'total' ? totalLabel : label}
                </span>
              </span>
            </CardContent>
          </Card>
        </motion.button>
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

function ChildrenDaily({ date, canCorrect }: { date: string; canCorrect: boolean }) {
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
  const [correcting, setCorrecting] = useState<CorrectionTarget | null>(null)
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
      <StatCards counts={counts} totalLabel="Enfants actifs" onSelect={openModal} selected={modal} />

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

      <DataTable footer={<PaginationControls page={safePage} pageCount={pageCount} onChange={setPage} />}>
        <DataTableHead>
          <Th>Enfant</Th>
          <Th>Statut</Th>
          <Th>Arrivée</Th>
          <Th>Départ</Th>
          <Th>Retard</Th>
        </DataTableHead>
        <TableBody>
          {isLoading ? (
            <TableSkeletonRows
              count={5}
              widths={['h-4 w-32', 'h-5 w-16 rounded-full', 'h-4 w-12', 'h-4 w-12', 'h-4 w-10']}
            />
          ) : visibleItems.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <Td colSpan={5} className="h-40 text-center text-muted-foreground">
                {search.trim() ? 'Aucun enfant ne correspond à cette recherche.' : 'Aucune donnée pour cette date.'}
              </Td>
            </TableRow>
          ) : (
            pageItems.map((item) => (
              <TableRow
                key={item.child.id}
                onClick={canCorrect ? () => setCorrecting({
                  personType: 'child',
                  personId: item.child.id,
                  displayName: `${item.child.first_names} ${item.child.last_name}`,
                  initialArrival: item.arrival_time,
                  initialDeparture: item.departure_time,
                }) : undefined}
                className={canCorrect ? 'cursor-pointer' : undefined}
                title={canCorrect ? 'Cliquer pour corriger les heures' : undefined}
              >
                <Td className="font-medium">
                  {item.child.first_names} {item.child.last_name}
                </Td>
                <Td><StatusBadge status={item.status} /></Td>
                <Td className="text-muted-foreground">{formatTime(item.arrival_time)}</Td>
                <Td className="text-muted-foreground">{formatTime(item.departure_time)}</Td>
                <Td className="text-muted-foreground">
                  {item.late_minutes != null ? `${item.late_minutes} min` : '—'}
                </Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </DataTable>

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

      {correcting && (
        <CorrectionDialog target={correcting} date={date} onClose={() => setCorrecting(null)} />
      )}
    </div>
  )
}

function StaffDaily({ date, canCorrect }: { date: string; canCorrect: boolean }) {
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
  const [correcting, setCorrecting] = useState<CorrectionTarget | null>(null)
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
      <StatCards counts={counts} totalLabel="Personnel actif" onSelect={openModal} selected={modal} />

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

      <DataTable footer={<PaginationControls page={safePage} pageCount={pageCount} onChange={setPage} />}>
        <DataTableHead>
          <Th>Personnel</Th>
          <Th>Statut</Th>
          <Th>Arrivée</Th>
          <Th>Départ</Th>
          <Th>Retard</Th>
          <Th>Cantine</Th>
        </DataTableHead>
        <TableBody>
          {isLoading ? (
            <TableSkeletonRows
              count={5}
              widths={['h-4 w-32', 'h-5 w-16 rounded-full', 'h-4 w-12', 'h-4 w-12', 'h-4 w-10', 'h-4 w-10']}
            />
          ) : visibleItems.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <Td colSpan={6} className="h-40 text-center text-muted-foreground">
                {search.trim() ? 'Aucun membre ne correspond à cette recherche.' : 'Aucune donnée pour cette date.'}
              </Td>
            </TableRow>
          ) : (
            pageItems.map((item) => (
              <TableRow
                key={item.staff.id}
                onClick={canCorrect ? () => setCorrecting({
                  personType: 'staff',
                  personId: item.staff.id,
                  displayName: item.staff.nickname || `${item.staff.first_name} ${item.staff.last_name}`,
                  initialArrival: item.arrival_time,
                  initialDeparture: item.departure_time,
                }) : undefined}
                className={canCorrect ? 'cursor-pointer' : undefined}
                title={canCorrect ? 'Cliquer pour corriger les heures' : undefined}
              >
                <Td className="font-medium">
                  {item.staff.nickname || `${item.staff.first_name} ${item.staff.last_name}`}
                </Td>
                <Td><StatusBadge status={item.status} /></Td>
                <Td className="text-muted-foreground">{formatTime(item.arrival_time)}</Td>
                <Td className="text-muted-foreground">{formatTime(item.departure_time)}</Td>
                <Td className="text-muted-foreground">
                  {item.late_minutes != null ? `${item.late_minutes} min` : '—'}
                </Td>
                <Td>
                  {item.meal_taken
                    ? <span className="inline-block rounded-full bg-pale-green px-3 py-1 text-xs font-semibold text-white">Oui</span>
                    : <span className="inline-block rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">Non</span>}
                </Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </DataTable>

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

      {correcting && (
        <CorrectionDialog target={correcting} date={date} onClose={() => setCorrecting(null)} />
      )}
    </div>
  )
}
