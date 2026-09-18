'use client'

import { motion } from 'framer-motion'
import { FileDown, LayoutDashboard, QrCode, ScanLine, ScrollText } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
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
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div>
        <h1 className="text-2xl font-bold">Présences</h1>
        <p className="text-muted-foreground">
          Suivi journalier, journal des scans, QR codes et paramètres de présence.
        </p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList className="h-auto w-full gap-1.5 overflow-x-auto rounded-2xl bg-card p-1.5 shadow-soft ring-1 ring-border">
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
        </TabsList>

        {showRead && (
          <TabsContent value="dashboard">
            <TabPanel value="dashboard">
              <DashboardTab />
            </TabPanel>
          </TabsContent>
        )}
        {showRead && (
          <TabsContent value="journal">
            <TabPanel value="journal">
              <JournalTab />
            </TabPanel>
          </TabsContent>
        )}
        {showWrite && (
          <TabsContent value="qrcodes">
            <TabPanel value="qrcodes">
              <QrCodesTab />
            </TabPanel>
          </TabsContent>
        )}
        {showScan && (
          <TabsContent value="scan">
            <TabPanel value="scan">
              <ScanTab />
            </TabPanel>
          </TabsContent>
        )}
        {showRead && (
          <TabsContent value="export">
            <TabPanel value="export">
              <ExportTab />
            </TabPanel>
          </TabsContent>
        )}
      </Tabs>
    </motion.div>
  )
}

function TabPanel({ value, children }: { value: string; children: React.ReactNode }) {  return (
    <motion.div
      key={value}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}
