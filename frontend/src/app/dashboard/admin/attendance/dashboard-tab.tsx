'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Baby, UserRound } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { attendanceApi } from '@/lib/api/attendance.api'
import { organizationApi } from '@/lib/api/organization.api'
import { StatusBadge } from './status-badge'

const ALL = '__all__'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function formatTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function DashboardTab() {
  const [date, setDate] = useState(todayIso())

  return (
    <div className="space-y-4 pt-2">
      <div className="w-fit space-y-1.5">
        <Label htmlFor="attendance-date" className="text-white font-semibold text-sm">Date</Label>
        <Input id="attendance-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
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

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center gap-4">
        <Select
          items={{ [ALL]: 'Tous les départements', ...Object.fromEntries((departments ?? []).map((d) => [d.id, d.name])) }}
          value={departmentId}
          onValueChange={(v) => setDepartmentId(v ?? ALL)}
        >
          <SelectTrigger className="w-52">
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
          <SelectTrigger className="w-52">
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
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="h-40 text-center text-muted-foreground">
                    Aucune donnée pour cette date.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
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
        </CardContent>
      </Card>
    </div>
  )
}

function StaffDaily({ date }: { date: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['attendance', 'daily', 'staff', { date }],
    queryFn: () => attendanceApi.getStaffDaily({ date }).then((r) => r.data),
  })

  const items = data?.items ?? []

  return (
    <div className="space-y-4 pt-2">
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
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="h-40 text-center text-muted-foreground">
                    Aucune donnée pour cette date.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
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
        </CardContent>
      </Card>
    </div>
  )
}
