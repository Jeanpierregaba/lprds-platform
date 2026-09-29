'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { FileDown, LayoutDashboard, QrCode, ScanLine, ScrollText, Settings } from 'lucide-react'

import { Tabs, TabsTrigger } from '@/components/ui/tabs'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { PillsTabsList, TabPanel } from '@/components/dashboard/shared/tabs'
import { DashboardTab } from './dashboard-tab'
import { ExportTab } from './export-tab'
import { JournalTab } from './journal-tab'
import { QrCodesTab } from './qrcodes-tab'
import { ScanTab } from './scan-tab'
import { SettingsTab } from './settings-tab'

export default function AttendancePage() {
  const t = useTranslations('attendance')
  const user = useUser()
  const { permissions, isLoading: isLoadingPermissions } = useMyPermissions()
  const isAdmin = user?.role === 'admin'
  const can = (code: string) => isAdmin || permissions.has(code)

  const showRead = can('attendance:read')
  const showWrite = can('attendance:write')
  const showScan = can('attendance:scan')
  const fallbackTab = showRead ? 'dashboard' : showScan ? 'scan' : showWrite ? 'qrcodes' : 'dashboard'
  const [tab, setTab] = useState<string | null>(null)
  // Onglet contrôlé : recalculé quand les permissions arrivent (async) —
  // plus de page vide pour les rôles restreints (ex. scan seul).
  const active = (tab && isTabVisible(tab) ? tab : null) ?? fallbackTab

  function isTabVisible(value: string) {
    if (value === 'dashboard' || value === 'journal' || value === 'export') return showRead
    if (value === 'qrcodes' || value === 'settings') return showWrite
    if (value === 'scan') return showScan
    return false
  }

  return (
    <PageMotion>
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
      />

      {!isLoadingPermissions && !showRead && !showWrite && !showScan ? (
        <p className="text-sm text-muted-foreground">
          Droits insuffisants — aucun accès au module présences.
        </p>
      ) : (
      <Tabs value={active} onValueChange={(v) => v && setTab(v)}>
        <PillsTabsList fit={false}>
          {showRead && (
            <TabsTrigger
              value="dashboard"
              className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-white/70 hover:text-foreground data-active:bg-teal data-active:text-white data-active:shadow-md"
            >
              <LayoutDashboard className="mr-1.5 size-4" />
              Tableau de bord
            </TabsTrigger>
          )}
          {showRead && (
            <TabsTrigger
              value="journal"
              className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-white/70 hover:text-foreground data-active:bg-sky data-active:text-white data-active:shadow-md"
            >
              <ScrollText className="mr-1.5 size-4" />
              Journal
            </TabsTrigger>
          )}
          {showWrite && (
            <TabsTrigger
              value="qrcodes"
              className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-white/70 hover:text-foreground data-active:bg-orange data-active:text-navy data-active:shadow-md"
            >
              <QrCode className="mr-1.5 size-4" />
              QR codes
            </TabsTrigger>
          )}
          {showScan && (
            <TabsTrigger
              value="scan"
              className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-white/70 hover:text-foreground data-active:bg-primary data-active:text-white data-active:shadow-md"
            >
              <ScanLine className="mr-1.5 size-4" />
              Scanner
            </TabsTrigger>
          )}
          {showRead && (
            <TabsTrigger
              value="export"
              className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-white/70 hover:text-foreground data-active:bg-navy data-active:text-white data-active:shadow-md"
            >
              <FileDown className="mr-1.5 size-4" />
              Export
            </TabsTrigger>
          )}
          {showWrite && (
            <TabsTrigger
              value="settings"
              className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-white/70 hover:text-foreground data-active:bg-secondary data-active:text-white data-active:shadow-md"
            >
              <Settings className="mr-1.5 size-4" />
              Paramètres
            </TabsTrigger>
          )}
        </PillsTabsList>

        {showRead && (
          <TabPanel value="dashboard">
            <DashboardTab />
          </TabPanel>
        )}
        {showRead && (
          <TabPanel value="journal">
            <JournalTab />
          </TabPanel>
        )}
        {showWrite && (
          <TabPanel value="qrcodes">
            <QrCodesTab />
          </TabPanel>
        )}
        {showScan && (
          <TabPanel value="scan">
            <ScanTab />
          </TabPanel>
        )}
        {showRead && (
          <TabPanel value="export">
            <ExportTab />
          </TabPanel>
        )}
        {showWrite && (
          <TabPanel value="settings">
            <SettingsTab />
          </TabPanel>
        )}
      </Tabs>
      )}
    </PageMotion>
  )
}
