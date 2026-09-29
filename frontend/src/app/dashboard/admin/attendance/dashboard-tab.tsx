'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlarmClock, Baby, CalendarOff, ChevronLeft, ChevronRight, Loader2, Mail, Search, ShieldCheck, UserRound, UserCheck, Users, UserX,
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
import { formatTimeIn, todayLocalIso } from '@/lib/utils/dates'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { DataTable, DataTableHead, TableSkeletonRows, Td, Th } from '@/components/dashboard/shared/table'
import { ConfirmDialog } from '@/components/dashboard/shared/dialogs'
import { StatusBadge } from './status-badge'
import type { AttendanceEvent, DailyStatusValue, PersonType } from '@/types/attendance'

const ALL = '__all__'
const PAGE_SIZE = 15
const MODAL_PAGE_SIZE = 8

type StatKey = 'total' | 'present' | 'absent' | 'late' | 'not_expected' | 'exempt'

function todayIso() {
  return todayLocalIso()
}

function formatTime(iso: string | null, timeZone?: string) {
  if (!iso) return '—'
  return timeZone ? formatTimeIn(iso, timeZone) : new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/** « HH:MM » depuis un ISO (pour pré-remplir les champs time), '' si absent. */
function toHHMM(iso: string | null, timeZone?: string) {
  if (!iso) return ''
  return timeZone ? formatTimeIn(iso, timeZone) : new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function matchesStat(status: DailyStatusValue, key: StatKey) {
  switch (key) {
    // « Présents » inclut les retards (ils sont bien là) — le détail reste
    // visible via la carte « En retard ».
    case 'present': return status === 'present' || status === 'late'
    case 'absent': return status === 'absent'
    case 'late': return status === 'late'
    case 'not_expected': return status === 'not_expected'
    case 'exempt': return status === 'exempt'
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
  not_expected: number
  exempt: number
}

// ── Correction manuelle des heures (lignes cliquables) ──────────
interface CorrectionTarget {
  personType: PersonType
  personId: string
  displayName: string
  initialArrival: string | null     // ISO du jour (1re arrivée), null si aucun scan
  initialDeparture: string | null   // ISO du jour (dernier départ), null si aucun scan
  timeZone?: string                 // fuseau établissement (pré-remplissage à la bonne heure)
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
      person_type: target.personType, ...personFilter, date_from: date, date_to: date, limit: 200,
    }).then((r) => r.data),
  })
  const dayItems: AttendanceEvent[] = data?.items ?? []
  const byTimeAsc = (a: AttendanceEvent, b: AttendanceEvent) =>
    new Date(a.scanned_at).getTime() - new Date(b.scanned_at).getTime()
  const arrivalEvent = dayItems
    .filter((e) => e.event_type === 'arrival')
    .sort(byTimeAsc)[0]
  const departureEvent = dayItems
    .filter((e) => e.event_type === 'departure')
    .sort((a, b) => -byTimeAsc(a, b))[0]
  // Cantine (staff uniquement) : la 1re du jour — un repas erroné était
  // indélébile via l'UI, le backend l'autorise désormais en manuel.
  const mealEvent = target.personType === 'staff'
    ? dayItems.filter((e) => e.event_type === 'meal').sort(byTimeAsc)[0]
    : undefined

  const initialArrivalHHMM = toHHMM(target.initialArrival, target.timeZone)
  const initialDepartureHHMM = toHHMM(target.initialDeparture, target.timeZone)
  const initialMealHHMM = toHHMM(mealEvent?.scanned_at ?? null, target.timeZone)
  const [arrival, setArrival] = useState(initialArrivalHHMM)
  const [departure, setDeparture] = useState(initialDepartureHHMM)
  const [meal, setMeal] = useState(initialMealHHMM)

  const arrivalDirty = arrival !== '' && arrival !== initialArrivalHHMM
  const departureDirty = departure !== '' && departure !== initialDepartureHHMM
  const mealDirty = meal !== '' && meal !== initialMealHHMM

  const save = useMutation({
    mutationFn: async () => {
      const ops: { label: string; run: () => Promise<unknown> }[] = []
      const personBody = target.personType === 'child'
        ? { child_id: target.personId }
        : { staff_id: target.personId }
      if (arrivalDirty) {
        ops.push({
          label: 'arrivée',
          run: () => arrivalEvent
            ? attendanceApi.updateEvent(arrivalEvent.id, { scanned_at: `${date}T${arrival}` })
            : attendanceApi.createManualEvent({
                person_type: target.personType, ...personBody, event_type: 'arrival', date, time: arrival,
              }),
        })
      }
      if (departureDirty) {
        ops.push({
          label: 'départ',
          run: () => departureEvent
            ? attendanceApi.updateEvent(departureEvent.id, { scanned_at: `${date}T${departure}` })
            : attendanceApi.createManualEvent({
                person_type: target.personType, ...personBody, event_type: 'departure', date, time: departure,
              }),
        })
      }
      if (mealDirty) {
        ops.push({
          label: 'cantine',
          run: () => mealEvent
            ? attendanceApi.updateEvent(mealEvent.id, { scanned_at: `${date}T${meal}` })
            : attendanceApi.createManualEvent({
                person_type: target.personType, ...personBody, event_type: 'meal', date, time: meal,
              }),
        })
      }
      // allSettled : une correction partielle persistée est signalée
      // explicitement (quelle heure a échoué), pas de toast générique.
      const results = await Promise.allSettled(ops.map((op) => op.run()))
      const failed = ops.filter((_, i) => results[i]?.status === 'rejected')
      if (failed.length > 0) {
        throw new Error(
          `Échec de la correction (${failed.map((op) => op.label).join(', ')}) — les autres heures sont enregistrées.`
        )
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      toast.success('Heures corrigées.')
      onClose()
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : getApiErrorMessage(err)),
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
          <div className={`grid gap-4 py-2 ${target.personType === 'staff' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
            <div className="space-y-1.5">
              <Label htmlFor="correct-arrival">Arrivée</Label>
              <Input
                id="correct-arrival"
                type="time"
                value={arrival}
                onChange={(e) => setArrival(e.target.value)}
              />
              {!arrivalEvent && !isLoading && (
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
              {!departureEvent && !isLoading && (
                <p className="text-xs text-muted-foreground">Aucun scan — sera créé.</p>
              )}
            </div>
            {target.personType === 'staff' && (
              <div className="space-y-1.5">
                <Label htmlFor="correct-meal">Cantine</Label>
                <Input
                  id="correct-meal"
                  type="time"
                  value={meal}
                  onChange={(e) => setMeal(e.target.value)}
                />
                {!mealEvent && !isLoading && (
                  <p className="text-xs text-muted-foreground">Aucun scan — sera créé.</p>
                )}
              </div>
            )}
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
            disabled={!(arrivalDirty || departureDirty || mealDirty) || save.isPending || isLoading}
          >
            {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const STAT_DEFS: { key: StatKey; label: string; icon: typeof Users; tint: string; hint: string }[] = [
  { key: 'total', label: 'Total', icon: Users, tint: 'bg-sky text-white', hint: 'Personnes suivies ce jour' },
  { key: 'present', label: 'Présents', icon: UserCheck, tint: 'bg-pale-green text-white', hint: 'Arrivés à l\u2019heure ou en retard' },
  { key: 'absent', label: 'Absents', icon: UserX, tint: 'bg-destructive text-white', hint: 'Jour ouvré sans arrivée' },
  { key: 'late', label: 'En retard', icon: AlarmClock, tint: 'bg-warning text-warning-foreground', hint: 'Arrivés après l\u2019horaire attendu' },
  { key: 'not_expected', label: 'Non attendus', icon: CalendarOff, tint: 'bg-muted text-muted-foreground', hint: 'Week-end : aucune présence attendue' },
  { key: 'exempt', label: 'Exemptés', icon: ShieldCheck, tint: 'bg-teal text-white', hint: 'Personnel exempté de pointage' },
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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {STAT_DEFS.map(({ key, label, icon: Icon, tint, hint }, i) => (
        <motion.button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className="text-left"
          title={hint}
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
        type="button" variant="outline" size="icon" className="h-10 w-10"
        disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Page précédente"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Button
        type="button" variant="outline" size="icon" className="h-10 w-10"
        disabled={page >= pageCount} onClick={() => onChange(page + 1)} aria-label="Page suivante"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )
}

function ModalPersonRow({ name, status, arrival, departure, timeZone }: { name: string; status: DailyStatusValue; arrival: string | null; departure?: string | null; timeZone?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-0">
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatTime(arrival, timeZone)}{departure ? ` → ${formatTime(departure, timeZone)}` : ''}
        </span>
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
  not_expected: 'Non attendus',
  exempt: 'Exemptés',
}

function ChildrenDaily({ date, canCorrect }: { date: string; canCorrect: boolean }) {
  const queryClient = useQueryClient()
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

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['attendance', 'daily', 'children', { date, departmentId, sectionId }],
    queryFn: () =>
      attendanceApi
        .getChildrenDaily({
          date,
          department_id: departmentId === ALL ? undefined : departmentId,
          section_id: sectionId === ALL ? undefined : sectionId,
        })
        .then((r) => r.data),
    enabled: date !== '',
  })

  const items = data?.items ?? []

  const counts = useMemo<StatCounts>(() => ({
    total: data?.total ?? items.length,
    present: items.filter((i) => i.status === 'present' || i.status === 'late').length,
    absent: items.filter((i) => i.status === 'absent').length,
    late: items.filter((i) => i.status === 'late').length,
    not_expected: items.filter((i) => i.status === 'not_expected').length,
    exempt: items.filter((i) => i.status === 'exempt').length,
  }), [data?.total, items])

  // Pagination (15 lignes/page) + modale par statut.
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState<StatKey | null>(null)
  const [modalPage, setModalPage] = useState(1)
  const [search, setSearch] = useState('')
  const [correcting, setCorrecting] = useState<CorrectionTarget | null>(null)
  const [confirmNotify, setConfirmNotify] = useState(false)
  const [relaunchTarget, setRelaunchTarget] = useState<{ id: string; name: string } | null>(null)
  useEffect(() => { setPage(1); setModal(null); setModalPage(1) }, [date, departmentId, sectionId, search])

  const notifyMutation = useMutation({
    mutationFn: () => attendanceApi.sendAbsenceInquiries({
      date,
      department_id: departmentId === ALL ? undefined : departmentId,
      section_id: sectionId === ALL ? undefined : sectionId,
    }).then((r) => r.data),
    onSuccess: (result) => {
      const parts = [`${result.notified.length} parent(s) prévenu(s)`]
      if (result.skipped_no_parent.length > 0) {
        parts.push(`${result.skipped_no_parent.length} sans compte parent (${result.skipped_no_parent.join(', ')})`)
      }
      if (result.already_notified.length > 0) {
        parts.push(`déjà prévenus : ${result.already_notified.join(', ')}`)
      }
      toast.success(`Enquête d'absence envoyée — ${parts.join(' · ')}.`)
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  // Relance individuelle : renvoi forcé pour un seul enfant (l'anti-doublon
  // journalier est contourné — action explicite, confirmée au clic).
  const relaunchMutation = useMutation({
    mutationFn: (childId: string) =>
      attendanceApi.sendAbsenceInquiries({ date, child_id: childId }).then((r) => r.data),
    onSuccess: (result) => {
      if (result.notified.length > 0) {
        toast.success(`Parent(s) de ${result.notified[0]?.children_names.join(', ')} relancé(s).`)
      } else if (result.skipped_no_parent.length > 0) {
        toast.warning(`Aucun compte parent pour ${result.skipped_no_parent.join(', ')}.`)
      } else {
        toast.info('Aucun parent à relancer.')
      }
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

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
          onValueChange={(v) => { setDepartmentId(v ?? ALL); setSectionId(ALL) }}
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
        <Button
          type="button"
          variant="outline"
          className="h-10"
          disabled={counts.absent === 0 || notifyMutation.isPending}
          onClick={() => setConfirmNotify(true)}
          title={counts.absent === 0 ? 'Aucun absent ce jour' : 'Envoyer un email + message aux parents des absents'}
        >
          {notifyMutation.isPending
            ? <Loader2 className="mr-1.5 size-4 animate-spin" />
            : <Mail className="mr-1.5 size-4" />}
          Prévenir les parents{counts.absent > 0 ? ` (${counts.absent})` : ''}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmNotify}
        onOpenChange={setConfirmNotify}
        title="Prévenir les parents des absents ?"
        description={`${counts.absent} enfant(s) sans arrivée ce jour. Un email et un message seront envoyés aux comptes parents assignés pour connaître le motif — les enfants déjà prévenus aujourd'hui sont ignorés.`}
        confirmLabel={notifyMutation.isPending ? 'Envoi…' : 'Envoyer'}
        confirmDisabled={notifyMutation.isPending}
        onConfirm={() => {
          setConfirmNotify(false)
          notifyMutation.mutate()
        }}
      />

      <DataTable footer={<PaginationControls page={safePage} pageCount={pageCount} onChange={setPage} />}>
        <DataTableHead>
          <Th>Enfant</Th>
          <Th>Statut</Th>
          <Th>Arrivée</Th>
          <Th>Départ</Th>
          <Th>Retard</Th>
          <Th className="w-10" />
        </DataTableHead>
        <TableBody>
          {isLoading ? (
            <TableSkeletonRows
              count={5}
              widths={['h-4 w-32', 'h-5 w-16 rounded-full', 'h-4 w-12', 'h-4 w-12', 'h-4 w-10', '']}
            />
          ) : isError ? (
            <TableRow className="hover:bg-transparent">
              <Td colSpan={6} className="h-40 text-center">
                <p className="font-medium text-foreground">Impossible de charger les présences.</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
                  Réessayer
                </Button>
              </Td>
            </TableRow>
          ) : visibleItems.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <Td colSpan={6} className="h-40 text-center text-muted-foreground">
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
                  timeZone: data?.timezone,
                }) : undefined}
                className={canCorrect ? 'cursor-pointer' : undefined}
                title={canCorrect ? 'Cliquer pour corriger les heures' : undefined}
              >
                <Td className="font-medium">
                  {item.child.first_names} {item.child.last_name}
                </Td>
                <Td><StatusBadge status={item.status} /></Td>
                <Td className="text-muted-foreground">{formatTime(item.arrival_time, data?.timezone)}</Td>
                <Td className="text-muted-foreground">{formatTime(item.departure_time, data?.timezone)}</Td>
                <Td className="text-muted-foreground">
                  {item.late_minutes != null ? `${item.late_minutes} min` : '—'}
                </Td>
                <Td>
                  {item.status === 'absent' && canCorrect && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-10 gap-1.5"
                      title="Relancer les parents de cet enfant"
                      disabled={relaunchMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation()
                        setRelaunchTarget({
                          id: item.child.id,
                          name: `${item.child.first_names} ${item.child.last_name}`,
                        })
                      }}
                    >
                      <Mail className="size-4" />
                      Contacter
                    </Button>
                  )}
                </Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </DataTable>

      <ConfirmDialog
        open={relaunchTarget !== null}
        onOpenChange={(open) => !open && setRelaunchTarget(null)}
        title={`Relancer les parents de ${relaunchTarget?.name ?? ''} ?`}
        description="Un email et un message seront renvoyés aux comptes parents assignés, même s'ils ont déjà été prévenus aujourd'hui."
        confirmLabel={relaunchMutation.isPending ? 'Envoi…' : 'Relancer'}
        confirmDisabled={relaunchMutation.isPending}
        onConfirm={() => {
          if (relaunchTarget) relaunchMutation.mutate(relaunchTarget.id)
          setRelaunchTarget(null)
        }}
      />

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
                departure={item.departure_time}
                timeZone={data?.timezone}
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
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['attendance', 'daily', 'staff', { date }],
    queryFn: () => attendanceApi.getStaffDaily({ date }).then((r) => r.data),
    enabled: date !== '',
  })

  const items = data?.items ?? []

  const counts = useMemo<StatCounts>(() => ({
    total: data?.total ?? items.length,
    present: items.filter((i) => i.status === 'present' || i.status === 'late').length,
    absent: items.filter((i) => i.status === 'absent').length,
    late: items.filter((i) => i.status === 'late').length,
    not_expected: items.filter((i) => i.status === 'not_expected').length,
    exempt: items.filter((i) => i.status === 'exempt').length,
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
          ) : isError ? (
            <TableRow className="hover:bg-transparent">
              <Td colSpan={6} className="h-40 text-center">
                <p className="font-medium text-foreground">Impossible de charger les présences.</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
                  Réessayer
                </Button>
              </Td>
            </TableRow>
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
                  timeZone: data?.timezone,
                }) : undefined}
                className={canCorrect ? 'cursor-pointer' : undefined}
                title={canCorrect ? 'Cliquer pour corriger les heures' : undefined}
              >
                <Td className="font-medium">
                  {item.staff.nickname || `${item.staff.first_name} ${item.staff.last_name}`}
                </Td>
                <Td><StatusBadge status={item.status} /></Td>
                <Td className="text-muted-foreground">{formatTime(item.arrival_time, data?.timezone)}</Td>
                <Td className="text-muted-foreground">{formatTime(item.departure_time, data?.timezone)}</Td>
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
                departure={item.departure_time}
                timeZone={data?.timezone}
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
