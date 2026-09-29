'use client'

import { useTranslations } from 'next-intl'
import { intlLocale } from '@/lib/utils/locale-format'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowRight, Baby, BookOpen, ClipboardCheck, FileText, Images, Sun, UserRound, Users,
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { attendanceApi } from '@/lib/api/attendance.api'
import { childrenApi } from '@/lib/api/children.api'
import { reportsApi } from '@/lib/api/reports.api'
import { useUser } from '@/lib/stores/auth.store'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { STAFF_BASELINE_ITEMS, STAFF_MODULE_ITEMS } from '@/components/dashboard/nav-items'
import { cn } from '@/lib/utils/cn'
import { Link } from '@/i18n/navigation'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function formatLongDate() {
  return new Date().toLocaleDateString(intlLocale(), {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
}

const item = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' as const } },
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-xl font-semibold text-white dark:text-foreground">{children}</h2>
}

function KpiCard({
  label, value, icon: Icon, tint, loading, href,
}: {
  label: string
  value: number
  icon: typeof Baby
  tint: string
  loading: boolean
  href: string
}) {
  return (
    <Link href={href}>
      <Card className="group relative overflow-hidden transition hover:-translate-y-0.5 hover:shadow-soft">
        <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-1.5', tint)} />
        <CardContent className="flex items-center gap-4 pt-6">
          <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm', tint)}>
            <Icon className="size-6" />
          </span>
          <span>
            <span className="block font-display text-3xl font-semibold leading-none">
              {loading ? '…' : value}
            </span>
            <span className="text-sm text-muted-foreground">{label}</span>
          </span>
        </CardContent>
      </Card>
    </Link>
  )
}

const MODULE_TINTS = ['bg-sky', 'bg-teal', 'bg-pink', 'bg-orange', 'bg-navy', 'bg-primary']

export default function StaffDashboardPage() {
  const tNav = useTranslations('nav')
  const user = useUser()
  const { permissions } = useMyPermissions()

  const canWriteReports = user?.role === 'admin' || permissions.has('reports:write')
  const canValidateReports = user?.role === 'admin' || permissions.has('reports:validate')

  const { data: myGroup, isLoading: loadingGroup } = useQuery({
    queryKey: ['staff', 'my-group'],
    queryFn: () => childrenApi.listMyGroup().then((r) => r.data),
  })

  const { data: daily, isLoading: loadingDaily } = useQuery({
    queryKey: ['staff', 'my-group-daily', { date: todayIso() }],
    queryFn: () => attendanceApi.getMyGroupDaily({ date: todayIso() }).then((r) => r.data),
  })

  const { data: drafts, isLoading: loadingDrafts } = useQuery({
    queryKey: ['staff', 'reports-draft-count'],
    queryFn: () => reportsApi.list({ status: 'draft', limit: 1 }).then((r) => r.data.total),
    enabled: canWriteReports,
  })

  const { data: toValidate, isLoading: loadingToValidate } = useQuery({
    queryKey: ['staff', 'reports-submitted-count'],
    queryFn: () => reportsApi.list({ status: 'submitted', limit: 1 }).then((r) => r.data.total),
    enabled: canValidateReports,
  })

  const groupItems = daily?.items ?? []
  const present = groupItems.filter((s) => s.status === 'present' || s.status === 'late').length
  const late = groupItems.filter((s) => s.status === 'late').length
  const absent = groupItems.filter((s) => s.status === 'absent').length
  const total = groupItems.length
  const rate = total > 0 ? Math.round((present / total) * 100) : 0

  const modules = STAFF_MODULE_ITEMS.filter((m) =>
    m.requireAll ? m.permissions.every((p) => permissions.has(p)) : m.permissions.some((p) => permissions.has(p))
  )

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
      <motion.section
        variants={item}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy via-secondary to-teal p-6 text-white shadow-soft sm:p-8"
      >
        <Sun className="pointer-events-none absolute -right-8 -top-8 size-44 text-white/10" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 size-48 rounded-full bg-primary/20 blur-3xl" />
        <p className="text-sm font-medium uppercase tracking-widest text-white/70 capitalize">
          {formatLongDate()}
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">
          Bonjour {user?.first_name} ☀️
        </h1>
        <p className="mt-2 max-w-xl text-sm text-white/80">
          Votre groupe, vos présences et vos rapports du jour — tout commence ici.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/dashboard/staff/my-group"
            className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium backdrop-blur transition hover:bg-white/25"
          >
            Mon groupe
          </Link>
          <Link
            href="/dashboard/staff/attendance"
            className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium backdrop-blur transition hover:bg-white/25"
          >
            Pointer les présences
          </Link>
          {canWriteReports && (
            <Link
              href="/dashboard/admin/reports/new"
              className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              Nouveau rapport
            </Link>
          )}
        </div>
      </motion.section>

      <motion.section variants={item} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Enfants du groupe" value={myGroup?.total ?? 0} icon={Baby} tint="bg-sky" loading={loadingGroup} href="/dashboard/staff/my-group" />
        <KpiCard label="Présents aujourd'hui" value={present} icon={UserRound} tint="bg-pale-green" loading={loadingDaily} href="/dashboard/staff/attendance" />
        <KpiCard label="En retard" value={late} icon={ClipboardCheck} tint="bg-orange" loading={loadingDaily} href="/dashboard/staff/attendance" />
        {canValidateReports ? (
          <KpiCard label="Rapports à valider" value={toValidate ?? 0} icon={FileText} tint="bg-navy" loading={loadingToValidate} href="/dashboard/admin/reports" />
        ) : canWriteReports ? (
          <KpiCard label="Brouillons en cours" value={drafts ?? 0} icon={FileText} tint="bg-navy" loading={loadingDrafts} href="/dashboard/admin/reports" />
        ) : (
          <KpiCard label="Absents aujourd'hui" value={absent} icon={Users} tint="bg-pink" loading={loadingDaily} href="/dashboard/staff/attendance" />
        )}
      </motion.section>

      <motion.section variants={item} className="space-y-3">
        <SectionTitle>Mon groupe aujourd&apos;hui</SectionTitle>
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-teal opacity-15 blur-2xl" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Pointage du jour — votre groupe</CardDescription>
              <Link href="/dashboard/staff/attendance" className="inline-flex items-center gap-1 text-xs font-medium text-sky hover:underline">
                Pointer <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <CardTitle className="font-display text-2xl">Les enfants sont-ils là ?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-2">
              <motion.span
                className="font-display text-5xl font-semibold text-navy dark:text-foreground"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
              >
                {loadingDaily ? '…' : `${rate}%`}
              </motion.span>
              <span className="pb-1.5 text-sm text-muted-foreground">de présence</span>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="bg-pale-green transition-all" style={{ width: `${total > 0 ? Math.round(((present - late) / total) * 100) : 0}%` }} />
              <div className="bg-orange transition-all" style={{ width: `${total > 0 ? Math.round((late / total) * 100) : 0}%` }} />
              <div className="bg-pink transition-all" style={{ width: `${total > 0 ? Math.round((absent / total) * 100) : 0}%` }} />
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span><strong className="font-semibold">{present - late}</strong> <span className="text-muted-foreground">présents</span></span>
              <span><strong className="font-semibold">{late}</strong> <span className="text-muted-foreground">en retard</span></span>
              <span><strong className="font-semibold">{absent}</strong> <span className="text-muted-foreground">absents</span></span>
            </div>
          </CardContent>
        </Card>
      </motion.section>

      <motion.section variants={item} className="space-y-3">
        <SectionTitle>Mes modules</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...STAFF_BASELINE_ITEMS, ...modules].map((m, i) => {
            const tint = MODULE_TINTS[i % MODULE_TINTS.length]
            const Icon = m.icon
            return (
              <motion.div
                key={m.href}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.05 }}
              >
                <Link href={m.href}>
                  <Card className="group relative h-full overflow-hidden transition hover:-translate-y-0.5 hover:shadow-soft">
                    <CardContent className="flex items-center gap-4 p-5">
                      <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm', tint)}>
                        <Icon className="size-5" />
                      </span>
                      <span className="font-display text-lg font-semibold leading-tight">{tNav(m.labelKey)}</span>
                      <ArrowRight className="ml-auto size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            )
          })}
        </div>
      </motion.section>

      {(canWriteReports || canValidateReports) && (
        <motion.section variants={item} className="flex flex-wrap gap-2">
          {canWriteReports && (
            <Link
              href="/dashboard/admin/reports"
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium transition hover:bg-accent/70"
            >
              <FileText className="size-4" />
              Mes brouillons ({drafts ?? 0})
            </Link>
          )}
          {canValidateReports && (
            <Link
              href="/dashboard/admin/reports"
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium transition hover:bg-accent/70"
            >
              <ClipboardCheck className="size-4" />
              Rapports à valider ({toValidate ?? 0})
            </Link>
          )}
          <Link
            href="/dashboard/staff/gallery"
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium transition hover:bg-accent/70"
          >
            <Images className="size-4" />
            Mes médias
          </Link>
          <Link
            href="/dashboard/staff/library"
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium transition hover:bg-accent/70"
          >
            <BookOpen className="size-4" />
            Bibliothèque
          </Link>
        </motion.section>
      )}
    </motion.div>
  )
}
