'use client'

import { FileDown, LayoutDashboard, QrCode, ScanLine, ScrollText } from 'lucide-react'

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

export default function AttendancePage() {
  const user = useUser()
  const { permissions } = useMyPermissions()
  const isAdmin = user?.role === 'admin'
  const can = (code: string) => isAdmin || permissions.has(code)

  const showRead = can('attendance:read')
  const showWrite = can('attendance:write')
  const showScan = can('attendance:scan')
  const defaultTab = showRead ? 'dashboard' : showScan ? 'scan' : showWrite ? 'qrcodes' : 'dashboard'

  return (
    <PageMotion>
      <PageHeader
        title="Présences"
        description="Suivi journalier, journal des scans, QR codes et paramètres de présence."
      />

      <Tabs defaultValue={defaultTab}>
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
      </Tabs>
    </PageMotion>
  )
}
