'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Eye, Loader2, Plus, QrCode, UserCheck, UserRound, UserX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableBody, TableRow } from '@/components/ui/table'
import { staffApi } from '@/lib/api/staff.api'
import { attendanceApi } from '@/lib/api/attendance.api'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { cn } from '@/lib/utils/cn'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { InactiveSwitch, SearchInput, ViewToggle, type ViewMode } from '@/components/dashboard/shared/filters'
import { DataTable, DataTableHead, TableSkeletonRows, Td, Th } from '@/components/dashboard/shared/table'
import { CardsEmptyState, CardsGrid, CardsSkeleton, ClickableCard, StaggerItem, StatusPill } from '@/components/dashboard/shared/cards'
import { ListPagination } from '@/components/dashboard/shared/pagination'
import { ConfirmDialog, QrBadgeDialog } from '@/components/dashboard/shared/dialogs'
import { STAFF_TYPE_LABELS, type StaffListItem, type StaffType } from '@/types/staff'
import { Link } from '@/i18n/navigation'

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
  const [view, setView] = useState<ViewMode>('cards')

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

  return (
    <PageMotion className="space-y-6">
      <PageHeader
        title="Personnel"
        description="Gérer les comptes de votre personnel."
        actions={
          canWrite ? (
          <Button render={<Link href="/dashboard/admin/staff/new" />}>
            <Plus className="mr-1.5 size-4" />
            Nouveau membre
          </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <SearchInput
          placeholder="Rechercher par nom, surnom, email ou matricule..."
          value={search}
          onChange={setSearch}
        />
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
        <InactiveSwitch
          id="include-inactive"
          checked={includeInactive}
          onCheckedChange={setIncludeInactive}
          label="Inclure les comptes inactifs"
        />

        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === 'cards' ? (
        <StaffCardGrid
          items={items}
          isLoading={isLoading}
          hasSearch={!!debouncedSearch}
        />
      ) : (
      <DataTable>
        <DataTableHead>
          <Th>Matricule</Th>
          <Th>Nom</Th>
          <Th>Type</Th>
          <Th>Email</Th>
          <Th>Statut</Th>
        </DataTableHead>
        <TableBody>
          {isLoading ? (
            <TableSkeletonRows
              widths={['h-4 w-20', 'h-4 w-40', 'h-4 w-28', 'h-4 w-32', 'h-5 w-14 rounded-full']}
            />
          ) : items.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <Td colSpan={5} className="h-56 text-center">
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
              </Td>
            </TableRow>
          ) : (
            items.map((s) => (
              <TableRow key={s.id} className={cn(!s.is_active && 'opacity-70')}>
                <Td>
                  <Link href={`/dashboard/admin/staff/${s.id}`} className="block font-mono text-xs">
                    {s.matricule ?? '—'}
                  </Link>
                </Td>
                <Td>
                  <Link href={`/dashboard/admin/staff/${s.id}`} className="block font-medium">
                    {s.nickname ?? `${s.first_name} ${s.last_name}`}
                  </Link>
                </Td>
                <Td>
                  <Link href={`/dashboard/admin/staff/${s.id}`} className="block text-muted-foreground">
                    {s.staff_type ? STAFF_TYPE_LABELS[s.staff_type] : '—'}
                  </Link>
                </Td>
                <Td>
                  <Link href={`/dashboard/admin/staff/${s.id}`} className="block text-muted-foreground">
                    {s.email}
                  </Link>
                </Td>
                <Td>
                  <Link href={`/dashboard/admin/staff/${s.id}`} className="block">
                    <StatusPill active={s.is_active} />
                  </Link>
                </Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </DataTable>
      )}

      <ListPagination
        label={<>{total} membre{total > 1 ? 's' : ''} {isFetching && !isLoading && '· actualisation...'}</>}
        skip={skip}
        pageSize={PAGE_SIZE}
        total={total}
        onSkipChange={setSkip}
      />
    </PageMotion>
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
    return <CardsSkeleton />
  }

  if (items.length === 0) {
    return (
      <CardsEmptyState
        icon={UserRound}
        title={hasSearch ? 'Aucun résultat pour cette recherche.' : 'Aucun membre du personnel pour le moment.'}
      />
    )
  }

  return (
    <CardsGrid>
      {items.map((member, i) => (
        <StaggerItem key={member.id} index={i}>
          <StaffCard member={member} canWrite={canWrite} canQr={canQr} />
        </StaggerItem>
      ))}
    </CardsGrid>
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
  const detailHref = `/dashboard/admin/staff/${member.id}`
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
    <>
      <ClickableCard
        href={detailHref}
        label={`Ouvrir le compte de ${member.nickname ?? `${member.first_name} ${member.last_name}`}`}
        inactive={!member.is_active}
      >
      <CardContent className="space-y-1.5 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 break-words font-display text-xl font-semibold leading-tight">
            {member.nickname ?? `${member.first_name} ${member.last_name}`}
          </p>
          <StatusPill active={member.is_active} shrink />
        </div>
        <p className="text-sm text-muted-foreground">
          Code: <span className="font-mono">{member.matricule ?? '—'}</span>
        </p>
        <p className="text-sm">
          <span className="font-medium">Poste:</span> {member.staff_type ? STAFF_TYPE_LABELS[member.staff_type] : '—'}
        </p>
        <p className="truncate text-sm text-muted-foreground" title={member.email}>{member.email}</p>

        <div className="flex flex-wrap gap-2 pt-3">
          <Button variant="outline" size="sm" className="rounded-xl bg-accent" render={<Link href={`/dashboard/admin/staff/${member.id}`} />}>
            <Eye className="mr-1.5 size-4" />
            Voir
          </Button>
          {canQr && (
            <Button variant="outline" size="sm" className="rounded-xl bg-accent" onClick={(e) => { e.stopPropagation(); setQrOpen(true) }}>
              <QrCode className="mr-1.5 size-4" />
              QR Code
            </Button>
          )}
          {canWrite && (
            member.is_active ? (
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
                {toggleMutation.isPending
                  ? <Loader2 className="mr-1.5 size-4 animate-spin" />
                  : <UserCheck className="mr-1.5 size-4" />}
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
        title={`Badge de ${member.nickname ?? member.first_name}`}
        subtitle={member.matricule ?? member.email}
        qrImage={qr?.qr_image}
        loading={loadingQr}
      />

      <ConfirmDialog
        open={confirmToggle}
        onOpenChange={setConfirmToggle}
        title="Désactiver ce compte ?"
        description={`${member.nickname ?? `${member.first_name} ${member.last_name}`} ne pourra plus se connecter (réversible depuis sa fiche).`}
        confirmLabel="Désactiver"
        onConfirm={() => {
          setConfirmToggle(false)
          toggleMutation.mutate()
        }}
      />
    </>
  )
}
