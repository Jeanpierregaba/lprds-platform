'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { BookOpen, ClipboardCheck, FileText, User } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ProfileSettingsTab } from '@/components/dashboard/profile-settings-tab'
import { SettingsTab as AttendanceSettingsTab } from '@/app/dashboard/admin/attendance/settings-tab'
import { SettingsTab as ReportsSettingsTab } from '@/app/dashboard/admin/reports/settings-tab'
import { SettingsTab as LibrarySettingsTab } from '@/app/dashboard/admin/library/settings-tab'
import { useUser } from '@/lib/stores/auth.store'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'

const TABS = [
  { value: 'profil', label: 'Profil', icon: User },
  { value: 'presences', label: 'Présences', icon: ClipboardCheck, perm: 'attendance:write' },
  { value: 'rapports', label: 'Rapports', icon: FileText, perm: 'reports:write' },
  {
    value: 'bibliotheque', label: 'Bibliothèque', icon: BookOpen,
    perms: ['library:read', 'library:write', 'library:lend'],
  },
] as const

function SettingsTabs() {
  const searchParams = useSearchParams()
  const user = useUser()
  const { permissions } = useMyPermissions()
  const [tab, setTab] = useState<string | null>(null)

  const isAdmin = user?.role === 'admin'
  const visible: string[] = TABS.filter((t) => {
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
      <TabsList className="h-auto w-full gap-1.5 overflow-x-auto rounded-2xl bg-card p-1.5 shadow-soft ring-1 ring-border sm:w-fit">
        {visible.includes('profil') && (
          <TabsTrigger
            value="profil"
            className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:bg-primary data-active:text-white data-active:shadow-md"
          >
            <User className="mr-1.5 size-4" />
            Profil
          </TabsTrigger>
        )}
        {visible.includes('presences') && (
          <TabsTrigger
            value="presences"
            className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:bg-teal data-active:text-white data-active:shadow-md"
          >
            <ClipboardCheck className="mr-1.5 size-4" />
            Présences
          </TabsTrigger>
        )}
        {visible.includes('rapports') && (
          <TabsTrigger
            value="rapports"
            className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:bg-sky data-active:text-white data-active:shadow-md"
          >
            <FileText className="mr-1.5 size-4" />
            Rapports
          </TabsTrigger>
        )}
        {visible.includes('bibliotheque') && (
          <TabsTrigger
            value="bibliotheque"
            className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:bg-navy data-active:text-white data-active:shadow-md"
          >
            <BookOpen className="mr-1.5 size-4" />
            Bibliothèque
          </TabsTrigger>
        )}
      </TabsList>
      {visible.includes('profil') && (
        <TabsContent value="profil">
          <motion.div
            key="profil"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <div className="max-w-2xl">
              <ProfileSettingsTab />
            </div>
          </motion.div>
        </TabsContent>
      )}
      {visible.includes('presences') && (
        <TabsContent value="presences">
          <motion.div
            key="presences"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <AttendanceSettingsTab />
          </motion.div>
        </TabsContent>
      )}
      {visible.includes('rapports') && (
        <TabsContent value="rapports">
          <motion.div
            key="rapports"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <ReportsSettingsTab />
          </motion.div>
        </TabsContent>
      )}
      {visible.includes('bibliotheque') && (
        <TabsContent value="bibliotheque">
          <motion.div
            key="bibliotheque"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <LibrarySettingsTab />
          </motion.div>
        </TabsContent>
      )}
    </Tabs>
  )
}

export default function AdminSettingsPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div>
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <p className="text-muted-foreground">Profil et paramètres des modules.</p>
      </div>

      <Suspense fallback={null}>
        <SettingsTabs />
      </Suspense>
    </motion.div>
  )
}
