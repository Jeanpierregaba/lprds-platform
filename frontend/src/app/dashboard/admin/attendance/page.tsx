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
        <TabsList>
          {showRead && (
            <TabsTrigger value="dashboard">
              <LayoutDashboard className="mr-1.5 size-4" />
              Tableau de bord
            </TabsTrigger>
          )}
          {showRead && (
            <TabsTrigger value="journal">
              <ScrollText className="mr-1.5 size-4" />
              Journal
            </TabsTrigger>
          )}
          {showWrite && (
            <TabsTrigger value="qrcodes">
              <QrCode className="mr-1.5 size-4" />
              QR codes
            </TabsTrigger>
          )}
          {showScan && (
            <TabsTrigger value="scan">
              <ScanLine className="mr-1.5 size-4" />
              Scanner
            </TabsTrigger>
          )}
          {showRead && (
            <TabsTrigger value="export">
              <FileDown className="mr-1.5 size-4" />
              Export
            </TabsTrigger>
          )}
        </TabsList>

        {showRead && (
          <TabsContent value="dashboard">
            <DashboardTab />
          </TabsContent>
        )}
        {showRead && (
          <TabsContent value="journal">
            <JournalTab />
          </TabsContent>
        )}
        {showWrite && (
          <TabsContent value="qrcodes">
            <QrCodesTab />
          </TabsContent>
        )}
        {showScan && (
          <TabsContent value="scan">
            <ScanTab />
          </TabsContent>
        )}
        {showRead && (
          <TabsContent value="export">
            <ExportTab />
          </TabsContent>
        )}
      </Tabs>
    </motion.div>
  )
}
