'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ClipboardCheck } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { attendanceApi } from '@/lib/api/attendance.api'
import { StatusBadge } from '../../admin/attendance/status-badge'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function formatTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export default function StaffAttendancePage() {
  const [date, setDate] = useState(todayIso())

  const { data, isLoading } = useQuery({
    queryKey: ['staff', 'attendance', 'my-group', date],
    queryFn: () => attendanceApi.getMyGroupDaily({ date }).then((r) => r.data),
  })

  const items = data?.items ?? []

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div>
        <h1 className="text-2xl font-bold">Présence</h1>
        <p className="text-muted-foreground">Statut du jour des enfants de votre groupe.</p>
      </div>

      <div className="w-fit space-y-1.5">
        <Label htmlFor="staff-attendance-date" className="text-white font-semibold text-sm">Date</Label>
        <Input id="staff-attendance-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
      </div>

      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          <div className="hidden sm:block">
            <Table className="border-collapse">
              <TableHeader className="bg-primary [&_tr]:border-transparent">
                <TableRow className="bg-primary hover:bg-primary">
                  <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Enfant</TableHead>
                  <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Statut</TableHead>
                  <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Arrivée</TableHead>
                  <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Départ</TableHead>
                  <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Retard</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="px-5 py-4"><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell className="px-5 py-4"><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                      <TableCell className="px-5 py-4"><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell className="px-5 py-4"><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell className="px-5 py-4"><Skeleton className="h-4 w-10" /></TableCell>
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="h-56 text-center">
                      <EmptyState />
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.child.id}>
                      <TableCell className="px-5 py-4 font-medium">
                        {item.child.first_names} {item.child.last_name}
                      </TableCell>
                      <TableCell className="px-5 py-4"><StatusBadge status={item.status} /></TableCell>
                      <TableCell className="px-5 py-4 text-muted-foreground">{formatTime(item.arrival_time)}</TableCell>
                      <TableCell className="px-5 py-4 text-muted-foreground">{formatTime(item.departure_time)}</TableCell>
                      <TableCell className="px-5 py-4 text-muted-foreground">
                        {item.late_minutes != null ? `${item.late_minutes} min` : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="divide-y divide-border sm:hidden">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2 px-4 py-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))
            ) : items.length === 0 ? (
              <div className="h-56"><EmptyState /></div>
            ) : (
              items.map((item) => (
                <div key={item.child.id} className="space-y-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium">
                      {item.child.first_names} {item.child.last_name}
                    </p>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Arrivée</p>
                      <p>{formatTime(item.arrival_time)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Départ</p>
                      <p>{formatTime(item.departure_time)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Retard</p>
                      <p>{item.late_minutes != null ? `${item.late_minutes} min` : '—'}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <ClipboardCheck className="size-5" />
      </div>
      <p className="font-medium text-foreground">Aucune donnée pour cette date.</p>
      <p className="max-w-sm text-sm text-center">
        Aucun enfant n&apos;est rattaché à votre groupe, ou aucun événement de présence n&apos;a été enregistré.
      </p>
    </div>
  )
}
