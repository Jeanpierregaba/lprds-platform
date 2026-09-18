'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Eye, LayoutGrid, List, Loader2, Plus, QrCode, Search, UserCheck, UserRound, UserX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { staffApi } from '@/lib/api/staff.api'
import { attendanceApi } from '@/lib/api/attendance.api'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { cn } from '@/lib/utils/cn'
import { STAFF_TYPE_LABELS, type StaffListItem, type StaffType } from '@/types/staff'

const PAGE_SIZE = 20
const ALL = '__all__'

export default function StaffListPage() {
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('staff:write')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [staffType, setStaffType] = useState<string>(ALL)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [skip, setSkip] = useState(0)
  const [view, setView] = useState<'table' | 'cards'>('cards')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => setSkip(0), [debouncedSearch, staffType, includeInactive])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['staff', { search: debouncedSearch, staffType, includeInactive, skip }],
    queryFn: () =>
      staffApi
        .list({
          search: debouncedSearch || undefined,
          staff_type: staffType === ALL ? undefined : (staffType as StaffType),
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Personnel</h1>
          <p className="text-muted-foreground">Gérer les comptes de votre personnel.</p>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && (
          <Button render={<Link href="/dashboard/admin/staff/new" />}>
            <Plus className="mr-1.5 size-4" />
            Nouveau membre
          </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, surnom, email ou matricule..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          items={{ [ALL]: 'Tous les types', ...STAFF_TYPE_LABELS }}
          value={staffType}
          onValueChange={(v) => setStaffType(v ?? ALL)}
        >
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Tous les types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les types</SelectItem>
            {Object.entries(STAFF_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="include-inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} />
          <Label htmlFor="include-inactive" className="text-sm text-white font-semibold">Inclure les comptes inactifs</Label>
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
        <StaffCardGrid
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
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Type</TableHead>
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Email</TableHead>
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-5 py-4"><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell className="px-5 py-4"><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell className="px-5 py-4"><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell className="px-5 py-4"><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell className="px-5 py-4"><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="h-56 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <UserRound className="size-5" />
                      </div>
                      <p className="font-medium text-foreground">
                        {debouncedSearch ? 'Aucun résultat pour cette recherche.' : 'Aucun membre du personnel pour le moment.'}
                      </p>
                      <p className="max-w-sm text-sm">
                        {debouncedSearch
                          ? 'Essayez un autre nom, surnom, email ou matricule.'
                          : 'Créez le premier compte pour commencer à gérer votre personnel.'}
                      </p>
                      {!debouncedSearch && canWrite && (
                        <Button render={<Link href="/dashboard/admin/staff/new" />} size="sm" className="mt-1">
                          <Plus className="mr-1.5 size-4" />
                          Nouveau membre
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((s) => (
                  <TableRow key={s.id} className={cn(!s.is_active && 'opacity-70')}>
                    <TableCell className="px-5 py-4">
                      <Link href={`/dashboard/admin/staff/${s.id}`} className="block font-mono text-xs">
                        {s.matricule ?? '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <Link href={`/dashboard/admin/staff/${s.id}`} className="block font-medium">
                        {s.nickname ?? `${s.first_name} ${s.last_name}`}
                      </Link>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <Link href={`/dashboard/admin/staff/${s.id}`} className="block text-muted-foreground">
                        {s.staff_type ? STAFF_TYPE_LABELS[s.staff_type] : '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <Link href={`/dashboard/admin/staff/${s.id}`} className="block text-muted-foreground">
                        {s.email}
                      </Link>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <Link href={`/dashboard/admin/staff/${s.id}`} className="block">
                        <span
                          className={cn(
                            'inline-block rounded-full px-3 py-1 text-xs font-semibold',
                            s.is_active ? 'bg-pale-green text-white' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {s.is_active ? 'Actif' : 'Inactif'}
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
          {total} membre{total > 1 ? 's' : ''} {isFetching && !isLoading && '· actualisation...'}
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
    </motion.div>
  )
}

function StaffCardGrid({
  items, isLoading, hasSearch,
}: { items: StaffListItem[]; isLoading: boolean; hasSearch: boolean }) {
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('staff:write')
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
            <UserRound className="size-5" />
          </div>
          <p className="font-medium text-foreground">
            {hasSearch ? 'Aucun résultat pour cette recherche.' : 'Aucun membre du personnel pour le moment.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((member, i) => (
        <motion.div
          key={member.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.05 }}
        >
          <StaffCard member={member} canWrite={canWrite} canQr={canQr} />
        </motion.div>
      ))}
    </div>
  )
}

function StaffCard({
  member, canWrite, canQr,
}: {
  member: StaffListItem
  canWrite: boolean
  canQr: boolean
}) {
  const queryClient = useQueryClient()
  const [qrOpen, setQrOpen] = useState(false)
  const [confirmToggle, setConfirmToggle] = useState(false)

  const toggleMutation = useMutation({
    mutationFn: () => staffApi.setStatus(member.id, !member.is_active),
    onSuccess: () => {
      toast.success(member.is_active ? 'Compte désactivé.' : 'Compte réactivé.')
      queryClient.invalidateQueries({ queryKey: ['staff'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const { data: qr, isLoading: loadingQr } = useQuery({
    queryKey: ['attendance', 'qr-staff', member.id],
    queryFn: () => attendanceApi.getStaffQrcode(member.id).then((r) => r.data),
    enabled: qrOpen,
  })

  return (
    <Card className={cn('rounded-2xl shadow-soft transition hover:-translate-y-0.5', !member.is_active && 'opacity-75')}>
      <CardContent className="space-y-1.5 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-xl font-semibold leading-tight">
            {member.nickname ?? `${member.first_name} ${member.last_name}`}
          </p>
          <span
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
              member.is_active ? 'bg-pale-green text-white' : 'bg-muted text-muted-foreground',
            )}
          >
            {member.is_active ? 'Actif' : 'Inactif'}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Code: <span className="font-mono">{member.matricule ?? '—'}</span>
        </p>
        <p className="text-sm">
          <span className="font-medium">Poste:</span> {member.staff_type ? STAFF_TYPE_LABELS[member.staff_type] : '—'}
        </p>
        <p className="truncate text-sm text-muted-foreground">{member.email}</p>

        <div className="flex flex-wrap gap-2 pt-3">
          <Button variant="outline" size="sm" className="rounded-xl bg-accent" render={<Link href={`/dashboard/admin/staff/${member.id}`} />}>
            <Eye className="mr-1.5 size-4" />
            Voir
          </Button>
          {canQr && (
            <Button variant="outline" size="sm" className="rounded-xl bg-accent" onClick={() => setQrOpen(true)}>
              <QrCode className="mr-1.5 size-4" />
              QR Code
            </Button>
          )}
          {canWrite && (
            member.is_active ? (
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
                {toggleMutation.isPending
                  ? <Loader2 className="mr-1.5 size-4 animate-spin" />
                  : <UserCheck className="mr-1.5 size-4" />}
                Réactiver
              </Button>
            )
          )}
        </div>
      </CardContent>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="font-display">Badge de {member.nickname ?? member.first_name}</DialogTitle>
            <DialogDescription className="font-mono text-xs">{member.matricule ?? member.email}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-2">
            {loadingQr || !qr ? (
              <Skeleton className="size-48 rounded-xl" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr.qr_image} alt={`QR ${member.matricule ?? ''}`} className="size-48 rounded-xl ring-1 ring-border" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmToggle} onOpenChange={setConfirmToggle}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Désactiver ce compte ?</AlertDialogTitle>
            <AlertDialogDescription>
              {member.nickname ?? `${member.first_name} ${member.last_name}`} ne pourra plus
              se connecter (réversible depuis sa fiche).
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
