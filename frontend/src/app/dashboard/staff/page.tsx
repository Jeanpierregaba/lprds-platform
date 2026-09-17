'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { FileText } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { StatCard } from '@/components/dashboard/stat-card'
import { STAFF_BASELINE_ITEMS, STAFF_MODULE_ITEMS } from '@/components/dashboard/nav-items'
import { useUser } from '@/lib/stores/auth.store'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { reportsApi } from '@/lib/api/reports.api'

export default function StaffDashboardPage() {
  const user = useUser()
  const { permissions, isLoading: isLoadingPermissions } = useMyPermissions()

  const canWriteReports = permissions.has('reports:write')
  const canValidateReports = permissions.has('reports:validate')

  const { data: drafts, isLoading: isLoadingDrafts } = useQuery({
    queryKey: ['staff', 'reports-draft-count'],
    queryFn: () => reportsApi.list({ status: 'draft', limit: 1 }).then((r) => r.data.total),
    enabled: canWriteReports,
  })

  const { data: toValidate, isLoading: isLoadingToValidate } = useQuery({
    queryKey: ['staff', 'reports-submitted-count'],
    queryFn: () => reportsApi.list({ status: 'submitted', limit: 1 }).then((r) => r.data.total),
    enabled: canValidateReports,
  })

  const modules = STAFF_MODULE_ITEMS.filter((m) =>
    m.requireAll ? m.permissions.every((p) => permissions.has(p)) : m.permissions.some((p) => permissions.has(p))
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold">Bonjour {user?.first_name} 👋</h1>
        <p className="text-muted-foreground">Voici vos modules et tâches en cours.</p>
      </div>

      {(canWriteReports || canValidateReports) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {canWriteReports && (
            <StatCard title="Rapports en brouillon" value={drafts ?? 0} icon={FileText} loading={isLoadingDrafts} />
          )}
          {canValidateReports && (
            <StatCard title="Rapports à valider" value={toValidate ?? 0} icon={FileText} loading={isLoadingToValidate} />
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STAFF_BASELINE_ITEMS.map((m) => (
          <Link key={m.href} href={m.href}>
            <Card className="h-full transition hover:border-primary hover:shadow-sm">
              <CardContent className="flex items-center gap-3 pt-6">
                <m.icon className="size-5 text-primary" />
                <p className="font-medium">{m.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
        {!isLoadingPermissions && modules.map((m) => (
          <Link key={m.href} href={m.href}>
            <Card className="h-full transition hover:border-primary hover:shadow-sm">
              <CardContent className="flex items-center gap-3 pt-6">
                <m.icon className="size-5 text-primary" />
                <p className="font-medium">{m.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </motion.div>
  )
}
