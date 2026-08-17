'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Building2, CheckCircle2, XCircle, Database, Server } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { establishmentsApi } from '@/lib/api/establishments.api'
import { checkReadiness } from '@/lib/api/health'
import { StatCard } from '@/components/dashboard/stat-card'

const CHECK_LABELS: Record<string, string> = {
  database: 'Base de données',
  redis: 'Redis',
}

const CHECK_ICONS: Record<string, React.ElementType> = {
  database: Database,
  redis: Server,
}

function SystemHealthCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['health', 'ready'],
    queryFn: checkReadiness,
    refetchInterval: 30_000,
  })

  const checks = data ? Object.entries(data.checks) : []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">État du système</CardTitle>
        <CardDescription>Disponibilité des dépendances critiques de l&apos;API.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex gap-4">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-8 w-40" />
          </div>
        ) : checks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Impossible de joindre l&apos;API.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {checks.map(([key, value]) => {
              const ok = value === 'ok'
              const Icon = CHECK_ICONS[key] ?? Server
              return (
                <div
                  key={key}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                >
                  <Icon className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{CHECK_LABELS[key] ?? key}</span>
                  <Badge
                    variant={ok ? 'default' : 'outline'}
                    className={cn(!ok && 'border-destructive text-destructive')}
                  >
                    {ok ? 'Opérationnel' : 'Indisponible'}
                  </Badge>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function SuperadminDashboardPage() {
  const { data: active, isLoading: loadingActive } = useQuery({
    queryKey: ['establishments', 'stats', 'active'],
    queryFn: () => establishmentsApi.list({ include_inactive: false, limit: 1 }).then((r) => r.data.total),
  })

  const { data: total, isLoading: loadingTotal } = useQuery({
    queryKey: ['establishments', 'stats', 'total'],
    queryFn: () => establishmentsApi.list({ include_inactive: true, limit: 1 }).then((r) => r.data.total),
  })

  const inactive = total !== undefined && active !== undefined ? total - active : undefined

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold">Tableau de bord</h1>
        <p className="text-muted-foreground">Vue d&apos;ensemble de la plateforme LPRDS.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Établissements" value={total ?? 0} icon={Building2} loading={loadingTotal} />
        <StatCard title="Actifs" value={active ?? 0} icon={CheckCircle2} loading={loadingActive} />
        <StatCard title="Inactifs" value={inactive ?? 0} icon={XCircle} loading={loadingActive || loadingTotal} />
      </div>

      <SystemHealthCard />
    </motion.div>
  )
}
