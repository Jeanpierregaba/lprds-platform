'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
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

export function HistoryTab({ onSelectWeek }: { onSelectWeek: (weekStart: string) => void }) {
  const [skip, setSkip] = useState(0)

  useEffect(() => setSkip(0), [])

  const { data, isLoading } = useQuery({
    queryKey: ['menus', 'history', { skip }],
    queryFn: () => menusApi.list({ skip, limit: PAGE_SIZE }).then((r) => r.data),
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []
  const hasNext = skip + PAGE_SIZE < total
  const hasPrev = skip > 0

  return (
    <div className="space-y-4 pt-2">
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Semaine</TableHead>
                <TableHead>Dernière modification</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={3} className="h-48 text-center">
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
                    <TableCell className="text-muted-foreground">{formatDateTime(menu.updated_at)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => onSelectWeek(menu.week_start)}>
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
