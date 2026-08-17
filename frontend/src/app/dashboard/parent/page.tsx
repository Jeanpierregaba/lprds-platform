'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { FileText, Megaphone, Images, UtensilsCrossed, ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatCard } from '@/components/dashboard/stat-card'
import { useUser } from '@/lib/stores/auth.store'
import { reportsApi } from '@/lib/api/reports.api'
import { messagingApi } from '@/lib/api/messaging.api'
import { REPORT_TYPE_LABELS } from '@/types/reports'

export default function ParentDashboardPage() {
  const user = useUser()

  const { data: reports, isLoading: isLoadingReports } = useQuery({
    queryKey: ['parent', 'reports-mine', 'dashboard'],
    queryFn: () => reportsApi.listMine({ limit: 5 }).then((r) => r.data),
  })

  const { data: announcements, isLoading: isLoadingAnnouncements } = useQuery({
    queryKey: ['parent', 'announcements', 'dashboard'],
    queryFn: () => messagingApi.listAnnouncements({ limit: 100 }).then((r) => r.data),
  })

  const unreadReports = reports?.items.filter((r) => !r.is_read).length ?? 0
  const unreadAnnouncements = announcements?.items.filter((a) => !a.is_read).length ?? 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold">Bonjour {user?.first_name} 👋</h1>
        <p className="text-muted-foreground">Voici les nouveautés concernant votre/vos enfant(s).</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard title="Rapports non lus" value={unreadReports} icon={FileText} loading={isLoadingReports} />
        <StatCard title="Diffusions non lues" value={unreadAnnouncements} icon={Megaphone} loading={isLoadingAnnouncements} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink href="/dashboard/parent/reports" icon={FileText} label="Rapports" description="Suivez le quotidien de votre enfant" />
        <QuickLink href="/dashboard/parent/messaging" icon={Megaphone} label="Messagerie" description="Diffusions et messages privés" />
        <QuickLink href="/dashboard/parent/gallery" icon={Images} label="Galerie" description="Photos et vidéos" />
        <QuickLink href="/dashboard/parent/menus" icon={UtensilsCrossed} label="Menus" description="Repas de la semaine" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Derniers rapports</CardTitle>
          <Button variant="ghost" size="sm" render={<Link href="/dashboard/parent/reports" />}>
            Voir tout <ArrowRight className="ml-1 size-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          {isLoadingReports ? (
            <p className="text-sm text-muted-foreground">Chargement...</p>
          ) : !reports || reports.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun rapport disponible pour le moment.</p>
          ) : (
            <ul className="divide-y divide-border">
              {reports.items.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/dashboard/parent/reports/${r.id}`}
                    className="flex items-center justify-between gap-2 py-2.5 text-sm hover:text-primary"
                  >
                    <span>
                      <span className="font-medium">{r.child.first_names} {r.child.last_name}</span>
                      {' · '}{REPORT_TYPE_LABELS[r.report_type]} · {r.period_label}
                    </span>
                    {!r.is_read && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Non lu" />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

function QuickLink({
  href, icon: Icon, label, description,
}: { href: string; icon: React.ElementType; label: string; description: string }) {
  return (
    <Link href={href}>
      <Card className="h-full transition hover:border-primary hover:shadow-sm">
        <CardContent className="flex flex-col gap-2 pt-6">
          <Icon className="size-5 text-primary" />
          <p className="font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </Link>
  )
}
