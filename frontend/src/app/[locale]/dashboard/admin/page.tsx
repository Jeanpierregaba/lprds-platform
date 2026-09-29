'use client'

import { useTranslations } from 'next-intl'

import { useQuery } from '@tanstack/react-query'
import { intlLocale } from '@/lib/utils/locale-format'
import { useLabel } from '@/lib/i18n/labels'
import { motion } from 'framer-motion'
import {
  ArrowRight, Baby, BellRing, BookOpen, Cake, FileText, MessageCircle,
  Sun, TriangleAlert, UserRound, Users, UtensilsCrossed,
} from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { attendanceApi } from '@/lib/api/attendance.api'
import { blogApi } from '@/lib/api/blog.api'
import { childrenApi } from '@/lib/api/children.api'
import { libraryApi } from '@/lib/api/library.api'
import { menusApi } from '@/lib/api/menus.api'
import { messagingApi } from '@/lib/api/messaging.api'
import { parentsApi } from '@/lib/api/parents.api'
import { reportsApi } from '@/lib/api/reports.api'
import { staffApi } from '@/lib/api/staff.api'
import { cn } from '@/lib/utils/cn'
import { WEEKDAYS, type Weekday } from '@/types/menus'
import type { DailyStatus } from '@/types/attendance'
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

function AttendanceCard({
  title, subtitle, href, statuses, loading, accent,
}: {
  title: string
  subtitle: string
  href: string
  statuses: DailyStatus[] | undefined
  loading: boolean
  accent: 'teal' | 'navy'
}) {
  const present = statuses?.filter((s) => s.status === 'present').length ?? 0
  const late = statuses?.filter((s) => s.status === 'late').length ?? 0
  const absent = statuses?.filter((s) => s.status === 'absent').length ?? 0
  const total = statuses?.length ?? 0
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
  const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0

  return (
    <Card className="relative overflow-hidden">
      <div className={cn(
        'pointer-events-none absolute -right-10 -top-10 size-40 rounded-full opacity-15 blur-2xl',
        accent === 'teal' ? 'bg-teal' : 'bg-primary',
      )} />
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription>{subtitle}</CardDescription>
          <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-sky hover:underline">
            Détail <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <CardTitle className="font-display text-2xl">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <motion.span
            className="font-display text-5xl font-semibold text-navy dark:text-foreground"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            {loading ? '…' : `${rate}%`}
          </motion.span>
          <span className="pb-1.5 text-sm text-muted-foreground">
            de présence · {present + late}/{total}
          </span>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-pale-green to-teal"
            initial={{ width: 0 }}
            animate={{ width: `${pct(present)}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
          <motion.div
            className="h-full bg-warning"
            initial={{ width: 0 }}
            animate={{ width: `${pct(late)}%` }}
            transition={{ duration: 0.7, ease: 'easeOut', delay: 0.15 }}
          />
          <motion.div
            className="h-full bg-destructive/80"
            initial={{ width: 0 }}
            animate={{ width: `${pct(absent)}%` }}
            transition={{ duration: 0.7, ease: 'easeOut', delay: 0.3 }}
          />
        </div>
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-pale-green" />
            <strong>{present}</strong> <span className="text-muted-foreground">présents</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-warning" />
            <strong>{late}</strong> <span className="text-muted-foreground">retards</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-destructive/80" />
            <strong>{absent}</strong> <span className="text-muted-foreground">absents</span>
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function ActionCard({
  href, icon: Icon, count, label, medallion, loading,
}: {
  href: string
  icon: typeof Baby
  count: number | undefined
  label: string
  medallion: string
  loading: boolean
}) {
  return (
    <Link href={href}>
      <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-soft">
        <CardContent className="flex items-center gap-3 pt-6">
          <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm', medallion)}>
            <Icon className="size-5" />
          </span>
          <span>
            <span className="block font-display text-2xl font-semibold leading-none">
              {loading ? '…' : (count ?? 0)}
            </span>
            <span className="text-sm text-muted-foreground">{label}</span>
          </span>
        </CardContent>
      </Card>
    </Link>
  )
}

export default function AdminDashboardPage() {
  const t = useTranslations('admin')
  const weekdaysLabel = useLabel('weekdays')
  const today = todayIso()

  const { data: children, isLoading: loadingChildren } = useQuery({
    queryKey: ['children', 'dashboard-all'],
    queryFn: () => childrenApi.list({ limit: 200 }).then((r) => r.data),
  })
  const { data: unassignedTotal } = useQuery({
    queryKey: ['children', 'dashboard-unassigned'],
    queryFn: () => childrenApi.list({ unassigned_only: true, limit: 1 }).then((r) => r.data.total),
  })
  const { data: parentsTotal, isLoading: loadingParents } = useQuery({
    queryKey: ['parents', 'dashboard-total'],
    queryFn: () => parentsApi.list({ limit: 1 }).then((r) => r.data.total),
  })
  const { data: staffTotal, isLoading: loadingStaff } = useQuery({
    queryKey: ['staff', 'dashboard-total'],
    queryFn: () => staffApi.list({ limit: 1 }).then((r) => r.data.total),
  })
  const { data: dailyChildren, isLoading: loadingDailyChildren } = useQuery({
    queryKey: ['attendance', 'dashboard-children', today],
    queryFn: () => attendanceApi.getChildrenDaily({ date: today }).then((r) => r.data),
  })
  const { data: dailyStaff, isLoading: loadingDailyStaff } = useQuery({
    queryKey: ['attendance', 'dashboard-staff', today],
    queryFn: () => attendanceApi.getStaffDaily({ date: today }).then((r) => r.data),
  })
  const { data: conversations, isLoading: loadingConversations } = useQuery({
    queryKey: ['messaging', 'dashboard-conversations'],
    queryFn: () => messagingApi.listConversations({ limit: 100 }).then((r) => r.data),
  })
  const { data: submittedTotal } = useQuery({
    queryKey: ['reports', 'dashboard-submitted'],
    queryFn: () => reportsApi.list({ status: 'submitted', limit: 1 }).then((r) => r.data.total),
  })
  const { data: rejectedTotal } = useQuery({
    queryKey: ['reports', 'dashboard-rejected'],
    queryFn: () => reportsApi.list({ status: 'rejected', limit: 1 }).then((r) => r.data.total),
  })
  const { data: lendings } = useQuery({
    queryKey: ['library', 'dashboard-lendings'],
    queryFn: () => libraryApi.listLendings({ status_filter: 'active', limit: 200 }).then((r) => r.data),
  })
  const { data: announcements } = useQuery({
    queryKey: ['messaging', 'dashboard-announcements'],
    queryFn: () => messagingApi.listAnnouncements({ limit: 5 }).then((r) => r.data),
  })
  const { data: draftsTotal } = useQuery({
    queryKey: ['blog', 'dashboard-drafts'],
    queryFn: () => blogApi.list({ status: 'draft', limit: 1 }).then((r) => r.data.total),
  })
  const { data: currentMenus } = useQuery({
    queryKey: ['menus', 'dashboard-current'],
    queryFn: () => menusApi.getCurrent().then((r) => r.data),
  })

  const unreadTotal = (conversations?.items ?? []).reduce((sum, c) => sum + c.unread_count, 0)
  const overdueCount = (lendings?.items ?? []).filter((l) => l.due_date < today).length

  const now = new Date()
  const birthdays = (children?.items ?? [])
    .filter((c) => c.is_active && new Date(c.birth_date).getMonth() === now.getMonth())
    .map((c) => {
      const birth = new Date(c.birth_date)
      return {
        id: c.id,
        name: `${c.first_names} ${c.last_name}`,
        day: birth.getDate(),
        dayLabel: birth.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'long' }),
        age: now.getFullYear() - birth.getFullYear(),
        section: c.section?.name ?? null,
        isToday: birth.getDate() === now.getDate(),
      }
    })
    .sort((a, b) => a.day - b.day)
  const monthYearLabel = now.toLocaleDateString(intlLocale(), { month: 'long', year: 'numeric' })

  const weekday = now.getDay()
  const todayKey: Weekday | null = weekday >= 1 && weekday <= 5 ? WEEKDAYS[weekday - 1]! : null
  const canteen = todayKey
    ? (currentMenus?.items ?? [])
        .map((m) => ({ department: m.department_name ?? t('home.defaultMenu'), lunch: m[todayKey]?.dejeuner?.trim() || null }))
        .filter((c) => c.lunch)
    : []

  const latestAnnouncement = announcements?.items[0]
  const readRate = latestAnnouncement?.total_parents
    ? Math.round(((latestAnnouncement.read_count ?? 0) / latestAnnouncement.total_parents) * 100)
    : 0
  const waiting = (conversations?.items ?? []).filter((c) => c.unread_count > 0).slice(0, 5)

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
          {t('home.greeting')}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-white/80">
          {t('home.adminIntro')}
          validations et anniversaires du mois.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/dashboard/admin/attendance"
            className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium backdrop-blur transition hover:bg-white/25"
          >
            {t('home.scan')}
          </Link>
          <Link
            href="/dashboard/admin/messaging"
            className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium backdrop-blur transition hover:bg-white/25"
          >
            Messagerie{unreadTotal > 0 ? ` (${unreadTotal})` : ''}
          </Link>
          <Link
            href="/dashboard/admin/reports"
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
          >
            Valider les rapports{submittedTotal ? ` (${submittedTotal})` : ''}
          </Link>
        </div>
      </motion.section>

      <motion.section variants={item} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t('home.kpi.activeChildren')} value={children?.total ?? 0} icon={Baby} tint="bg-sky" loading={loadingChildren} href="/dashboard/admin/children" />
        <KpiCard label={t('home.kpi.parents')} value={parentsTotal ?? 0} icon={Users} tint="bg-pink" loading={loadingParents} href="/dashboard/admin/parents" />
        <KpiCard label={t('home.kpi.activeStaff')} value={staffTotal ?? 0} icon={UserRound} tint="bg-teal" loading={loadingStaff} href="/dashboard/admin/staff" />
        <KpiCard label={t('home.kpi.rejectedReports')} value={rejectedTotal ?? 0} icon={TriangleAlert} tint="bg-orange" loading={false} href="/dashboard/admin/reports" />
      </motion.section>

      <motion.section variants={item} className="space-y-3">
        <SectionTitle>{t('home.attendanceSection')}</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          <AttendanceCard
            title={t('home.childrenHere')}
            subtitle={t('home.childrenHereHint')}
            href="/dashboard/admin/attendance"
            statuses={dailyChildren?.items}
            loading={loadingDailyChildren}
            accent="teal"
          />
          <AttendanceCard
            title={t('home.teamHere')}
            subtitle={t('home.teamHereHint')}
            href="/dashboard/admin/attendance"
            statuses={dailyStaff?.items}
            loading={loadingDailyStaff}
            accent="navy"
          />
        </div>
      </motion.section>

      <motion.section variants={item} className="space-y-3">
        <SectionTitle>{t('home.todo')}</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ActionCard href="/dashboard/admin/messaging" icon={MessageCircle} count={unreadTotal} label={t('home.unreadMessagesLabel')} medallion="bg-sky" loading={loadingConversations} />
          <ActionCard href="/dashboard/admin/reports" icon={FileText} count={submittedTotal} label={t('home.reportsToValidate')} medallion="bg-orange" loading={false} />
          <ActionCard href="/dashboard/admin/library" icon={BookOpen} count={overdueCount} label={t('home.overdueLendings')} medallion="bg-pink" loading={false} />
          <ActionCard href="/dashboard/admin/children" icon={Baby} count={unassignedTotal} label={t('home.childrenNoGroup')} medallion="bg-teal" loading={false} />
        </div>
      </motion.section>

      <motion.section variants={item} className="grid gap-4 lg:grid-cols-5">
        <Card className="overflow-hidden lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 font-display text-xl">
              <Cake className="size-6 text-pink" />
              {t('home.birthdays')} <span className="capitalize">{monthYearLabel}</span>
            </CardTitle>
            <CardDescription>
              {birthdays.length === 0
                ? t('home.noBirthday')
                : t('home.birthdayCount', { count: birthdays.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingChildren ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-24 w-full animate-pulse rounded-2xl bg-muted" />
                ))}
              </div>
            ) : birthdays.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t('home.checkNextMonth')}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {birthdays.map((b, i) => (
                  <motion.div
                    key={b.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.06 }}
                  >
                    <Link
                      href={`/dashboard/admin/children/${b.id}`}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl bg-pink/10 p-3 ring-1 ring-pink/20 transition hover:bg-pink/15 hover:shadow-soft',
                        b.isToday && 'bg-pink/15 ring-2 ring-pink/50',
                      )}
                    >
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-pink text-white shadow-sm">
                        <Cake className="size-6" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{b.name}</span>
                        <span className="block text-sm text-muted-foreground capitalize">
                          {b.isToday ? (
                            <strong className="text-pink">Aujourd&apos;hui · {b.age} ans 🎉</strong>
                          ) : (
                            <>{b.dayLabel} - {b.age} ans</>
                          )}
                        </span>
                        {b.section && (
                          <span className="mt-1 inline-block rounded-full bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border">
                            {b.section}
                          </span>
                        )}
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {todayKey && canteen.length > 0 && (
            <Card className="overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-orange to-primary" />
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 font-display text-lg">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-orange text-navy shadow-sm">
                    <UtensilsCrossed className="size-5" />
                  </span>
                  {t('home.canteen', { day: weekdaysLabel(todayKey) })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {canteen.map((c) => (
                    <li key={c.department} className="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                      <span className="shrink-0 font-medium">{c.department}</span>
                      <span className="text-muted-foreground sm:truncate sm:text-right" title={c.lunch ?? undefined}>{c.lunch}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {latestAnnouncement && (
            <Card className="overflow-hidden">
        
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 font-display text-lg">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-sky text-white shadow-sm">
                    <BellRing className="size-5" />
                  </span>
                  {t('home.lastAnnouncement')}
                </CardTitle>
                <CardDescription className="break-words" title={latestAnnouncement.title}>{latestAnnouncement.title}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Taux de lecture</span>
                  <span className="font-display font-semibold">
                    {latestAnnouncement.read_count ?? 0}/{latestAnnouncement.total_parents ?? 0}
                  </span>
                </div>
                <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-sky to-teal"
                    initial={{ width: 0 }}
                    animate={{ width: `${readRate}%` }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                  />
                </div>
                <Button variant="outline" size="sm" className="mt-3" render={<Link href="/dashboard/admin/messaging" />}>
                  {t('home.seeMessaging')}
                </Button>
              </CardContent>
            </Card>
          )}

          {(draftsTotal ?? 0) > 0 && (
            <Card className="border-dashed">
              <CardContent className="flex items-center justify-between gap-2 pt-6">
                <p className="text-sm">
                  <strong className="font-display text-lg">{draftsTotal}</strong> article{draftsTotal! > 1 ? 's' : ''} en brouillon sur le site vitrine.
                </p>
                <Button variant="outline" size="sm" render={<Link href="/dashboard/admin/blog" />}>
                  {t('home.seeBlog')}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-lg">{t('home.pendingConversations')}</CardTitle>
              <CardDescription>{t('home.pendingConversationsHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingConversations ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="h-9 w-full animate-pulse rounded-xl bg-muted" />
                  ))}
                </div>
              ) : waiting.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">Aucun message en attente. 🎉</p>
              ) : (
                <ul className="space-y-1">
                  {waiting.map((c) => (
                    <li key={c.id}>
                      <Link
                        href="/dashboard/admin/messaging"
                        className="flex items-center justify-between rounded-xl px-2 py-1.5 text-sm transition hover:bg-sky/10"
                      >
                        <span className="font-medium">
                          {c.parent.nickname || `${c.parent.first_name} ${c.parent.last_name}`}
                        </span>
                        <span className="rounded-full bg-sky px-2.5 py-0.5 text-xs font-bold text-white">
                          {c.unread_count}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </motion.section>
    </motion.div>
  )
}
