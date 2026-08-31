'use client'

import { motion } from 'framer-motion'
import { FileDown, LayoutDashboard, QrCode, ScanLine, ScrollText, Settings } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DashboardTab } from './dashboard-tab'
import { ExportTab } from './export-tab'
import { JournalTab } from './journal-tab'
import { QrCodesTab } from './qrcodes-tab'
import { ScanTab } from './scan-tab'
import { SettingsTab } from './settings-tab'

export default function AttendancePage() {
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

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">
            <LayoutDashboard className="mr-1.5 size-4" />
            Tableau de bord
          </TabsTrigger>
          <TabsTrigger value="journal">
            <ScrollText className="mr-1.5 size-4" />
            Journal
          </TabsTrigger>
          <TabsTrigger value="qrcodes">
            <QrCode className="mr-1.5 size-4" />
            QR codes
          </TabsTrigger>
          <TabsTrigger value="scan">
            <ScanLine className="mr-1.5 size-4" />
            Scanner
          </TabsTrigger>
          <TabsTrigger value="export">
            <FileDown className="mr-1.5 size-4" />
            Export
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="mr-1.5 size-4" />
            Paramètres
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardTab />
        </TabsContent>
        <TabsContent value="journal">
          <JournalTab />
        </TabsContent>
        <TabsContent value="qrcodes">
          <QrCodesTab />
        </TabsContent>
        <TabsContent value="scan">
          <ScanTab />
        </TabsContent>
        <TabsContent value="export">
          <ExportTab />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
