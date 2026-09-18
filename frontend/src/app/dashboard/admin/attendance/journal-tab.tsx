'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { attendanceApi } from '@/lib/api/attendance.api'
import { cn } from '@/lib/utils/cn'
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

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

export function JournalTab() {
  const [personType, setPersonType] = useState<string>(ALL)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [skip, setSkip] = useState(0)

  useEffect(() => setSkip(0), [personType, dateFrom, dateTo])

  const { data, isLoading, isFetching } = useQuery({
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
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []
  const hasNext = skip + PAGE_SIZE < total
  const hasPrev = skip > 0

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

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          <Table className="border-collapse">
            <TableHeader className="bg-primary [&_tr]:border-transparent">
              <TableRow className="bg-primary hover:bg-primary">
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Horodatage</TableHead>
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Type</TableHead>
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Événement</TableHead>
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Personne</TableHead>
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Scanné par</TableHead>
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Accompagnateur</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-5 py-4"><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell className="px-5 py-4"><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                    <TableCell className="px-5 py-4"><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                    <TableCell className="px-5 py-4"><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell className="px-5 py-4"><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell className="px-5 py-4"><Skeleton className="h-4 w-24" /></TableCell>
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <ScrollText className="size-5" />
                      </div>
                      <p className="font-medium text-foreground">Aucun événement pour ces filtres.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((event) => {
                  const person = event.child ?? event.staff
                  const personName = person
                    ? person.nickname || `${person.first_names ?? person.first_name ?? ''} ${person.last_name}`.trim()
                    : '—'
                  return (
                    <TableRow key={event.id}>
                      <TableCell className="px-5 py-4 text-muted-foreground">{formatDateTime(event.scanned_at)}</TableCell>
                      <TableCell className="px-5 py-4">
                        <span className={cn('inline-block rounded-full px-3 py-1 text-xs font-semibold', PERSON_TYPE_PILLS[event.person_type])}>
                          {PERSON_TYPE_LABELS[event.person_type]}
                        </span>
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <span className={cn('inline-block rounded-full px-3 py-1 text-xs font-semibold', EVENT_PILLS[event.event_type])}>
                          {EVENT_LABELS[event.event_type] ?? event.event_type}
                        </span>
                      </TableCell>
                      <TableCell className="px-5 py-4 font-medium">{personName}</TableCell>
                      <TableCell className="px-5 py-4 text-muted-foreground">
                        {event.scanned_by.first_name} {event.scanned_by.last_name}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-muted-foreground">
                        {event.companion_name ? `${event.companion_name}${event.companion_phone ? ` · ${event.companion_phone}` : ''}` : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} événement{total > 1 ? 's' : ''} {isFetching && !isLoading && '· actualisation...'}
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
    </div>
  )
}
