'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Building, LayoutGrid, Network, ShieldCheck, Users, UserRound, ArrowRight } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/dashboard/stat-card'
import { organizationApi } from '@/lib/api/organization.api'
import { rbacApi } from '@/lib/api/rbac.api'
import { staffApi } from '@/lib/api/staff.api'

export default function AdminDashboardPage() {
  const { data: departments, isLoading: loadingDepartments } = useQuery({
    queryKey: ['departments', { includeInactive: false }],
    queryFn: () => organizationApi.listDepartments(false).then((r) => r.data),
  })

  const { data: sections, isLoading: loadingSections } = useQuery({
    queryKey: ['sections', { departmentId: '__all__', includeInactive: false }],
    queryFn: () => organizationApi.listSections({ include_inactive: false }).then((r) => r.data),
  })

  const { data: groups, isLoading: loadingGroups } = useQuery({
    queryKey: ['groups', { sectionId: '__all__', includeInactive: false }],
    queryFn: () => organizationApi.listGroups({ include_inactive: false }).then((r) => r.data),
  })

  const { data: roles, isLoading: loadingRoles } = useQuery({
    queryKey: ['roles', { includeInactive: false }],
    queryFn: () => rbacApi.listRoles(false).then((r) => r.data),
  })

  const { data: staff, isLoading: loadingStaff } = useQuery({
    queryKey: ['staff', 'stats'],
    queryFn: () => staffApi.list({ include_inactive: false, limit: 1 }).then((r) => r.data.total),
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-3xl font-bold">Tableau de bord</h1>
        <p className="text-muted-foreground">Vue d&apos;ensemble de votre établissement.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Personnel actif" value={staff ?? 0} icon={UserRound} loading={loadingStaff} />
        <StatCard title="Départements" value={departments?.length ?? 0} icon={Building} loading={loadingDepartments} />
        <StatCard title="Sections" value={sections?.length ?? 0} icon={LayoutGrid} loading={loadingSections} />
        <StatCard title="Groupes" value={groups?.length ?? 0} icon={Users} loading={loadingGroups} />
        <StatCard title="Rôles" value={roles?.length ?? 0} icon={ShieldCheck} loading={loadingRoles} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <Network className="mb-1 size-5 text-muted-foreground" />
            <CardTitle className="text-base">Organisation</CardTitle>
            <CardDescription>
              Structurer votre établissement en départements, sections et groupes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" render={<Link href="/dashboard/admin/organization" />}>
              Gérer l&apos;organisation
              <ArrowRight className="ml-1.5 size-4" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <ShieldCheck className="mb-1 size-5 text-muted-foreground" />
            <CardTitle className="text-base">Rôles &amp; permissions</CardTitle>
            <CardDescription>
              Définir les rôles de votre personnel et attribuer leurs droits.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" render={<Link href="/dashboard/admin/roles" />}>
              Gérer les rôles
              <ArrowRight className="ml-1.5 size-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  )
}
