'use client'

import { useTranslations } from 'next-intl'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { BookOpen, ClipboardCheck, FileText, User } from 'lucide-react'

import { Tabs } from '@/components/ui/tabs'
import { ProfileSettingsTab } from '@/components/dashboard/profile-settings-tab'
import { SettingsTab as AttendanceSettingsTab } from '@/app/[locale]/dashboard/admin/attendance/settings-tab'
import { SettingsTab as ReportsSettingsTab } from '@/app/[locale]/dashboard/admin/reports/settings-tab'
import { SettingsTab as LibrarySettingsTab } from '@/app/[locale]/dashboard/admin/library/settings-tab'
import { useUser } from '@/lib/stores/auth.store'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'

const TABS = [
  { value: 'profil', labelKey: 'profil', icon: User },
  { value: 'presences', labelKey: 'presences', icon: ClipboardCheck, perm: 'attendance:write' },
  // Types activés par département : réservé à l'admin — une éducatrice porte
  // reports:write (elle rédige) mais ne configure pas les types actifs.
  { value: 'rapports', labelKey: 'rapports', icon: FileText, adminOnly: true },
  {
    value: 'bibliotheque', labelKey: 'bibliotheque', icon: BookOpen,
    perms: ['library:read', 'library:write', 'library:lend'],
  },
] as const

function SettingsTabs() {
  const t = useTranslations('admin')
  const searchParams = useSearchParams()
  const user = useUser()
  const { permissions } = useMyPermissions()
  const [tab, setTab] = useState<string | null>(null)

  const isAdmin = user?.role === 'admin'
  const visible: string[] = TABS.filter((t) => {
    if ('adminOnly' in t && t.adminOnly) return isAdmin
    if (!('perm' in t) && !('perms' in t)) return true
    if (isAdmin) return true
    if ('perms' in t) return t.perms.every((p) => permissions.has(p))
    return permissions.has(t.perm)
  }).map((t) => t.value)

  const requested = searchParams.get('tab')
  const active =
    (tab && visible.includes(tab) ? tab : null) ??
    (requested && visible.includes(requested) ? requested : null) ??
    visible[0] ??
    'profil'

  return (
    <Tabs value={active} onValueChange={(v) => v && setTab(v)}>
      <PillsTabsList>
        {visible.includes('profil') && (
          <PillsTrigger value="profil" active="primary" icon={User}>
            {t('settings.tabs.profil')}
          </PillsTrigger>
        )}
        {visible.includes('presences') && (
          <PillsTrigger value="presences" active="teal" icon={ClipboardCheck}>
            {t('settings.tabs.presences')}
          </PillsTrigger>
        )}
        {visible.includes('rapports') && (
          <PillsTrigger value="rapports" active="sky" icon={FileText}>
            {t('settings.tabs.rapports')}
          </PillsTrigger>
        )}
        {visible.includes('bibliotheque') && (
          <PillsTrigger value="bibliotheque" active="navy" icon={BookOpen}>
            {t('settings.tabs.bibliotheque')}
          </PillsTrigger>
        )}
      </PillsTabsList>
      {visible.includes('profil') && (
        <TabPanel value="profil">
          <div className="max-w-2xl">
            <ProfileSettingsTab />
          </div>
        </TabPanel>
      )}
      {visible.includes('presences') && (
        <TabPanel value="presences">
          <AttendanceSettingsTab />
        </TabPanel>
      )}
      {visible.includes('rapports') && (
        <TabPanel value="rapports">
          <ReportsSettingsTab />
        </TabPanel>
      )}
      {visible.includes('bibliotheque') && (
        <TabPanel value="bibliotheque">
          <LibrarySettingsTab />
        </TabPanel>
      )}
    </Tabs>
  )
}

export default function AdminSettingsPage() {
  const t = useTranslations('admin')
  return (
    <PageMotion>
      <PageHeader
        title={t('settings.title')}
        description={t('settings.description')}
      />

      <Suspense fallback={null}>
        <SettingsTabs />
      </Suspense>
    </PageMotion>
  )
}
