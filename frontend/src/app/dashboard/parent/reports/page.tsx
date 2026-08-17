'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { reportsApi } from '@/lib/api/reports.api'
import { REPORT_TYPE_LABELS } from '@/types/reports'
import { useMyChildren } from '../use-my-children'

const ALL = '__all__'
const PAGE_SIZE = 20

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('fr-FR') : '—'
}

export default function ParentReportsPage() {
  const [childId, setChildId] = useState(ALL)
  const [skip, setSkip] = useState(0)
  const { children } = useMyChildren()

  useEffect(() => setSkip(0), [childId])

  const { data, isLoading } = useQuery({
    queryKey: ['parent', 'reports-mine', { childId, skip }],
    queryFn: () =>
      reportsApi
        .listMine({ child_id: childId === ALL ? undefined : childId, skip, limit: PAGE_SIZE })
        .then((r) => r.data),
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []
  const hasNext = skip + PAGE_SIZE < total
  const hasPrev = skip > 0

  const childItems = { [ALL]: 'Tous les enfants', ...Object.fromEntries(children.map((c) => [c.id, `${c.first_names} ${c.last_name}`])) }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div>
        <h1 className="text-2xl font-bold">Rapports</h1>
        <p className="text-muted-foreground">Rapports de vie validés de votre/vos enfant(s).</p>
      </div>

      {children.length > 1 && (
        <Select items={childItems} value={childId} onValueChange={(v) => setChildId(v ?? ALL)}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Tous les enfants" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(childItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex h-48 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <FileText className="size-5" />
            </div>
            <p className="font-medium text-foreground">Aucun rapport disponible pour le moment.</p>
            <p className="max-w-sm text-sm">Les rapports apparaissent ici une fois validés par l&apos;établissement.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <Link key={r.id} href={`/dashboard/parent/reports/${r.id}`}>
              <Card className="transition hover:border-primary">
                <CardContent className="flex items-center justify-between gap-3 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                      <FileText className="size-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {r.child.first_names} {r.child.last_name} · {REPORT_TYPE_LABELS[r.report_type]}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {r.period_label} {r.validated_at && `· Publié le ${formatDate(r.validated_at)}`}
                      </p>
                    </div>
                  </div>
                  {!r.is_read && <Badge variant="default">Nouveau</Badge>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {!isLoading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} rapports</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>
              Précédent
            </Button>
            <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setSkip(skip + PAGE_SIZE)}>
              Suivant
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
