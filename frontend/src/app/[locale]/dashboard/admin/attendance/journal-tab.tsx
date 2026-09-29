'use client'

import { useEffect, useState } from 'react'
import { intlLocale } from '@/lib/utils/locale-format'
import { useQuery } from '@tanstack/react-query'
import { ScrollText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableBody, TableRow } from '@/components/ui/table'
import { attendanceApi } from '@/lib/api/attendance.api'
import { cn } from '@/lib/utils/cn'
import { DataTable, DataTableHead, TableSkeletonRows, Td, Th } from '@/components/dashboard/shared/table'
import { ListPagination } from '@/components/dashboard/shared/pagination'
import type { PersonType } from '@/types/attendance'

const PAGE_SIZE = 25
const ALL = '__all__'

const EVENT_LABELS: Record<string, string> = {
  arrival: 'Arrivée',
  departure: 'Départ',
  meal: 'Cantine',
}

const PERSON_TYPE_LABELS: Record<string, string> = {
  child: 'Enfant',
  staff: 'Personnel',
}

const EVENT_PILLS: Record<string, string> = {
  arrival: 'bg-pale-green text-white',
  departure: 'bg-navy text-white',
  meal: 'bg-warning text-warning-foreground',
}

const PERSON_TYPE_PILLS: Record<string, string> = {
  child: 'bg-sky text-white',
  staff: 'bg-teal text-white',
}

function formatDateTime(iso: string, timeZone?: string) {
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat(intlLocale(), {
        dateStyle: 'short', timeStyle: 'short', timeZone,
      }).format(new Date(iso))
    } catch {
      // repli local ci-dessous
    }
  }
  return new Date(iso).toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' })
}

export function JournalTab() {
  const [personType, setPersonType] = useState<string>(ALL)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [skip, setSkip] = useState(0)

  useEffect(() => setSkip(0), [personType, dateFrom, dateTo])

  const invalidRange = dateFrom !== '' && dateTo !== '' && dateTo < dateFrom

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['attendance', 'events', { personType, dateFrom, dateTo, skip }],
    queryFn: () =>
      attendanceApi
        .listEvents({
          person_type: personType === ALL ? undefined : (personType as PersonType),
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          skip,
          limit: PAGE_SIZE,
        })
        .then((r) => r.data),
    enabled: !invalidRange,
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []
  // Re-clamp : si le total se réduit (filtre resserré), on ne reste pas sur
  // une page vide — retour manuel inutile.
  useEffect(() => {
    if (!isLoading && total > 0 && skip >= total) setSkip(0)
  }, [total, isLoading, skip])

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-white font-semibold text-sm">Type</Label>
          <Select
            items={{ [ALL]: 'Tous', child: 'Enfants', staff: 'Personnel' }}
            value={personType}
            onValueChange={(v) => setPersonType(v ?? ALL)}
          >
            <SelectTrigger className="h-9 w-full sm:w-44">
              <SelectValue placeholder="Tous" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tous</SelectItem>
              <SelectItem value="child">Enfants</SelectItem>
              <SelectItem value="staff">Personnel</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date_from" className="text-white font-semibold text-sm">Du</Label>
          <Input id="date_from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full sm:w-44" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date_to" className="text-white font-semibold text-sm">Au</Label>
          <Input id="date_to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full sm:w-44" />
        </div>
      </div>

      <DataTable>
        <DataTableHead>
          <Th>Horodatage</Th>
          <Th>Type</Th>
          <Th>Événement</Th>
          <Th>Personne</Th>
          <Th>Scanné par</Th>
          <Th>Accompagnateur</Th>
        </DataTableHead>
        <TableBody>
          {isLoading ? (
            <TableSkeletonRows
              widths={['h-4 w-28', 'h-5 w-16 rounded-full', 'h-5 w-16 rounded-full', 'h-4 w-32', 'h-4 w-28', 'h-4 w-24']}
            />
          ) : invalidRange ? (
            <TableRow className="hover:bg-transparent">
              <Td colSpan={6} className="h-48 text-center">
                <p className="font-medium text-foreground">La date de fin doit être postérieure ou égale à la date de début.</p>
              </Td>
            </TableRow>
          ) : isError ? (
            <TableRow className="hover:bg-transparent">
              <Td colSpan={6} className="h-48 text-center">
                <p className="font-medium text-foreground">Impossible de charger le journal.</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
                  Réessayer
                </Button>
              </Td>
            </TableRow>
          ) : items.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <Td colSpan={6} className="h-48 text-center">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                    <ScrollText className="size-5" />
                  </div>
                  <p className="font-medium text-foreground">Aucun événement pour ces filtres.</p>
                </div>
              </Td>
            </TableRow>
          ) : (
                items.map((event) => {
                  const person = event.child ?? event.staff
                  const personName = person
                    ? person.nickname || `${person.first_names ?? person.first_name ?? ''} ${person.last_name}`.trim()
                    : '—'
                  const matricule = person?.matricule ?? null
                  return (
                    <TableRow key={event.id}>
                      <Td className="text-muted-foreground">{formatDateTime(event.scanned_at, data?.timezone)}</Td>
                      <Td>
                        <span className={cn('inline-block rounded-full px-3 py-1 text-xs font-semibold', PERSON_TYPE_PILLS[event.person_type])}>
                          {PERSON_TYPE_LABELS[event.person_type]}
                        </span>
                      </Td>
                      <Td>
                        <span className={cn('inline-block rounded-full px-3 py-1 text-xs font-semibold', EVENT_PILLS[event.event_type])}>
                          {EVENT_LABELS[event.event_type] ?? event.event_type}
                        </span>
                      </Td>
                      <Td className="font-medium">
                        {personName}
                        {matricule && <div className="font-mono text-xs font-normal text-muted-foreground">{matricule}</div>}
                      </Td>
                  <Td className="text-muted-foreground">
                    {event.scanned_by.first_name} {event.scanned_by.last_name}
                  </Td>
                  <Td className="text-muted-foreground">
                    {event.companion_name ? `${event.companion_name}${event.companion_phone ? ` · ${event.companion_phone}` : ''}` : '—'}
                  </Td>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </DataTable>

      <ListPagination
        label={<>{total} événement{total > 1 ? 's' : ''} {isFetching && !isLoading && '· actualisation...'}</>}
        skip={skip}
        pageSize={PAGE_SIZE}
        total={total}
        onSkipChange={setSkip}
      />
    </div>
  )
}
