'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { menusApi } from '@/lib/api/menus.api'
import { parseIsoDate } from '@/lib/utils/dates'

const PAGE_SIZE = 20

function formatDate(iso: string) {
  return parseIsoDate(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

export function HistoryTab({ onSelectMenu }: { onSelectMenu: (weekStart: string, departmentId: string) => void }) {
  const ALL = '__all__'
  const [skip, setSkip] = useState(0)
  const [departmentId, setDepartmentId] = useState<string>(ALL)

  useEffect(() => setSkip(0), [departmentId])

  const { data: departments = [] } = useQuery({
    queryKey: ['menus', 'visible-departments'],
    queryFn: () => menusApi.getVisibleDepartments().then((r) => r.data.items),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['menus', 'history', { skip, departmentId }],
    queryFn: () => menusApi.list({
      skip, limit: PAGE_SIZE,
      department_id: departmentId === ALL ? undefined : departmentId,
    }).then((r) => r.data),
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []
  const hasNext = skip + PAGE_SIZE < total
  const hasPrev = skip > 0

  return (
    <div className="space-y-4 pt-2">
      <div className="w-full space-y-1.5 sm:w-52">
        <Label htmlFor="history-department">Département</Label>
        <Select
          items={{ [ALL]: 'Tous les départements', ...Object.fromEntries(departments.map((d) => [d.id, d.name])) }}
          value={departmentId}
          onValueChange={(v) => v && setDepartmentId(v)}
        >
          <SelectTrigger id="history-department" className="w-full">
            <SelectValue placeholder="Tous les départements" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les départements</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Semaine</TableHead>
                <TableHead>Département</TableHead>
                <TableHead>Dernière modification</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <History className="size-5" />
                      </div>
                      <p className="font-medium text-foreground">Aucun menu enregistré pour le moment.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((menu) => (
                  <TableRow key={menu.id}>
                    <TableCell className="font-medium">
                      {formatDate(menu.week_start)} — {formatDate(menu.week_end)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {menu.department_name ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(menu.updated_at)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => onSelectMenu(menu.week_start, menu.department_id)}>
                        Voir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} semaine{total > 1 ? 's' : ''} enregistrée{total > 1 ? 's' : ''}</span>
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
