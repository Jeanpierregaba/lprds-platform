'use client'

import { useTranslations } from 'next-intl'

import { useQuery } from '@tanstack/react-query'
import { intlLocale } from '@/lib/utils/locale-format'
import { useLabel } from '@/lib/i18n/labels'
import { motion } from 'framer-motion'
import {
  ArrowRight, Baby, BookMarked, FileText, Images, Megaphone,
  MessageCircle, Sun, UtensilsCrossed,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useUser } from '@/lib/stores/auth.store'
import { libraryApi } from '@/lib/api/library.api'
import { menusApi } from '@/lib/api/menus.api'
import { messagingApi } from '@/lib/api/messaging.api'
import { parentsApi } from '@/lib/api/parents.api'
import { reportsApi } from '@/lib/api/reports.api'
import { cn } from '@/lib/utils/cn'
import { type Weekday } from '@/types/menus'
import { Link } from '@/i18n/navigation'
import { ChildAvatar } from '@/components/children/child-avatar'
import { ChildPhotoButton } from '@/components/children/child-photo-editor'

function formatLongDate() {
  return new Date().toLocaleDateString(intlLocale(), {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function todayWeekday(): Weekday | null {
  const map: Record<number, Weekday | null> = {
    0: null, 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: null,
  }
  return map[new Date().getDay()] ?? null
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

const CHILD_TINTS = ['bg-sky', 'bg-teal', 'bg-pink', 'bg-orange', 'bg-navy']

export default function ParentDashboardPage() {
  const t = useTranslations('admin')
  const tl = useTranslations('library')
  const tCommon = useTranslations('common')
  const reportTypesLabel = useLabel('reportTypes')
  const weekdaysLabel = useLabel('weekdays')
  const user = useUser()

  const { data: children = [], isLoading: loadingChildren, refetch: refetchChildren } = useQuery({
    queryKey: ['parent', 'my-children'],
    queryFn: () => parentsApi.listMyChildren().then((r) => r.data),
  })

  const { data: reports, isLoading: loadingReports } = useQuery({
    queryKey: ['parent', 'reports-mine', 'dashboard'],
    queryFn: () => reportsApi.listMine({ limit: 50 }).then((r) => r.data),
  })

  const { data: announcements, isLoading: loadingAnnouncements } = useQuery({
    queryKey: ['parent', 'announcements', 'dashboard'],
    queryFn: () => messagingApi.listAnnouncements({ limit: 100 }).then((r) => r.data),
  })

  const { data: conversation } = useQuery({
    queryKey: ['parent', 'conversation', 'dashboard'],
    queryFn: () => messagingApi.getMyConversation().then((r) => r.data),
  })

  const { data: lendings, isLoading: loadingLendings } = useQuery({
    queryKey: ['parent', 'lendings', 'dashboard'],
    queryFn: () => libraryApi.listMyLendings({ limit: 50 }).then((r) => r.data),
  })

  const { data: currentMenus } = useQuery({
    queryKey: ['parent', 'menus-current', 'dashboard'],
    queryFn: () => menusApi.getCurrent().then((r) => r.data),
  })

  const allReports = reports?.items ?? []
  const unreadReports = allReports.filter((r) => !r.is_read)
  const unreadAnnouncements = announcements?.items.filter((a) => !a.is_read).length ?? 0
  const unreadMessages = conversation?.unread_count ?? 0
  const activeLendings = (lendings?.items ?? []).filter((l) => l.status !== 'returned')
  const latestReports = allReports.slice(0, 5)

  const weekday = todayWeekday()
  const canteen = (currentMenus?.items ?? [])
    .map((m) => ({
      department: m.department_name ?? t('home.defaultMenu'),
      lunch: weekday ? m[weekday]?.dejeuner : null,
    }))
    .filter((c) => c.lunch)

  const unreadByChild = (childId: string) =>
    unreadReports.filter((r) => r.child.id === childId).length

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
          {t('home.parentGreeting', { name: user?.first_name ?? '' })}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-white/80">
          {t('home.parentIntro', { who: children.length > 1 ? t('home.parentIntroManyChildren') : t('home.parentIntroOneChild') })}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/dashboard/parent/messaging"
            className="rounded-full bg-white/15 px-4 py-2.5 text-sm font-medium backdrop-blur transition hover:bg-white/25"
          >
            {t('home.seeMessagingCount', { suffix: unreadMessages + unreadAnnouncements > 0 ? ` (${unreadMessages + unreadAnnouncements})` : '' })}
          </Link>
          <Link
            href="/dashboard/parent/reports"
            className="rounded-full bg-white/15 px-4 py-2.5 text-sm font-medium backdrop-blur transition hover:bg-white/25"
          >
            {t('home.seeReportsCount', { suffix: unreadReports.length > 0 ? ` (${unreadReports.length})` : '' })}
          </Link>
          <Link
            href="/dashboard/parent/gallery"
            className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
          >
            {t('home.galleryPhotos')}
          </Link>
        </div>
      </motion.section>

      <motion.section variants={item} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t('home.kpi.unreadReports')} value={unreadReports.length} icon={FileText} tint="bg-orange" loading={loadingReports} href="/dashboard/parent/reports" />
        <KpiCard label={t('home.kpi.unreadAnnouncements')} value={unreadAnnouncements} icon={Megaphone} tint="bg-sky" loading={loadingAnnouncements} href="/dashboard/parent/messaging" />
        <KpiCard label={t('home.kpi.unreadMessages')} value={unreadMessages} icon={MessageCircle} tint="bg-teal" loading={false} href="/dashboard/parent/messaging" />
        <KpiCard label={t('home.kpi.borrowedBooks')} value={activeLendings.length} icon={BookMarked} tint="bg-navy" loading={loadingLendings} href="/dashboard/parent/library" />
      </motion.section>

      <motion.section variants={item} className="space-y-3">
        <SectionTitle>{t('home.myChildren')}</SectionTitle>
        {loadingChildren ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-28 w-full animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : children.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t('home.noChild')}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {children.map((child, i) => {
              const tint = CHILD_TINTS[i % CHILD_TINTS.length]
              const unread = unreadByChild(child.id)
              const initial = (child.first_names?.[0] ?? child.last_name[0] ?? '?').toUpperCase()
              return (
                <motion.div
                  key={child.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.06 }}
                >
                  <div className="relative">
                  <Link href="/dashboard/parent/reports">
                    <Card className="group relative overflow-hidden transition hover:-translate-y-0.5 hover:shadow-soft">
                      <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-1.5', tint)} />
                      <CardContent className="flex items-center gap-4 pt-6">
                        {child.has_photo ? (
                          <ChildAvatar
                            childId={child.id}
                            firstNames={child.first_names}
                            lastName={child.last_name}
                            hasPhoto
                            size="lg"
                            className="size-12 rounded-2xl shadow-sm"
                          />
                        ) : (
                          /* Sans photo, on garde la pastille colorée d'origine :
                             elle porte déjà la teinte propre à chaque enfant. */
                          <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-2xl font-display text-xl font-semibold text-white shadow-sm', tint)}>
                            {initial}
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate font-display text-xl font-semibold leading-tight">
                            {child.first_names} {child.last_name}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {unread > 0 ? t('home.unreadReportCount', { count: unread }) : t('home.allRead')}
                          </span>
                        </span>
                        <ArrowRight className="ml-auto size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
                      </CardContent>
                    </Card>
                  </Link>
                  {/* ⚠️ En dehors du lien : à l'intérieur, choisir un fichier
                      ouvrirait aussi la page des rapports. Un parent dépose la
                      photo de SON enfant depuis ici — c'est l'endroit où il la
                      cherchera, plutôt qu'un écran de réglages. */}
                  <ChildPhotoButton
                    childId={child.id}
                    hasPhoto={child.has_photo}
                    onChanged={() => refetchChildren()}
                    className="absolute right-3 top-3 z-10"
                  />
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </motion.section>

      <motion.section variants={item} className="grid gap-4 lg:grid-cols-5">
        <Card className="overflow-hidden lg:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>{t('home.priorityRead')}</CardDescription>
              <Link href="/dashboard/parent/reports" className="inline-flex items-center gap-1 py-1 text-xs font-medium text-sky hover:underline">
                {tCommon('actions.seeAll')} <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <CardTitle className="font-display text-2xl">{t('home.latestReports')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingReports ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 w-full animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : latestReports.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t('home.noReport')}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {latestReports.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/dashboard/parent/reports/${r.id}`}
                      className="flex min-w-0 items-center justify-between gap-3 py-2.5 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {r.child.first_names} {r.child.last_name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {reportTypesLabel(r.report_type)} · {r.period_label}
                        </span>
                      </span>
                      {!r.is_read ? (
                        <span className="shrink-0 rounded-full bg-orange px-3 py-1 text-xs font-semibold text-white">
                          {t('home.unread')}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                          {t('home.readBadge')}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {weekday && canteen.length > 0 && (
            <Card className="overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-orange to-primary" />
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 font-display text-lg">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-orange text-navy shadow-sm">
                    <UtensilsCrossed className="size-5" />
                  </span>
                  {t('home.canteen', { day: weekdaysLabel(weekday) })}
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

          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription>{t('home.library')}</CardDescription>
                <Link href="/dashboard/parent/library" className="inline-flex items-center gap-1 py-1 text-xs font-medium text-sky hover:underline">
                  {t('home.detail')} <ArrowRight className="size-3.5" />
                </Link>
              </div>
              <CardTitle className="font-display text-lg">{tl('mine.borrowedBooks')}</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingLendings ? (
                <div className="space-y-2">
                  <div className="h-10 w-full animate-pulse rounded-xl bg-muted" />
                </div>
              ) : activeLendings.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">{tl('mine.noneBorrowed')}</p>
              ) : (
                <ul className="space-y-2.5">
                  {activeLendings.slice(0, 4).map((l) => (
                    <li key={l.id} className="text-sm">
                      <span className="block truncate font-medium">{l.book_title}</span>
                      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="min-w-0 truncate">{l.child_name} · {tl('mine.returnOn', { date: new Date(l.due_date + 'T00:00:00').toLocaleDateString(intlLocale()) })}</span>
                        {l.status === 'overdue' || l.overdue_days != null ? (
                          <span className="shrink-0 rounded-full bg-destructive px-2.5 py-0.5 font-semibold text-white">{tl('mine.overdue')}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Link href="/dashboard/parent/gallery">
            <Card className="group relative overflow-hidden transition hover:-translate-y-0.5 hover:shadow-soft">
              <CardContent className="flex items-center gap-4 pt-6">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-pink text-white shadow-sm">
                  <Images className="size-6" />
                </span>
                <span>
                  <span className="block font-display text-xl font-semibold leading-tight">{t('home.galleryPhotos')}</span>
                  <span className="text-sm text-muted-foreground">{t('home.parentGalleryHint')}</span>
                </span>
                <ArrowRight className="ml-auto size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
              </CardContent>
            </Card>
          </Link>

          <div className="flex justify-end">
            <Button variant="outline" className="h-10" render={<Link href="/dashboard/parent/menus" />}>
              <UtensilsCrossed className="mr-1.5 size-4" />
              {t('home.seeWeekMenus')}
            </Button>
          </div>
        </div>
      </motion.section>
    </motion.div>
  )
}
