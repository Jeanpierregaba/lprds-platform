'use client'

import { motion } from 'framer-motion'
import { FileText, Settings } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ReportsListTab } from './reports-list-tab'
import { SettingsTab } from './settings-tab'

export default function ReportsPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div>
        <h1 className="text-2xl font-bold">Rapports</h1>
        <p className="text-muted-foreground">Rapports de vie des enfants — quotidien, bi-mensuel, annuel.</p>
      </div>

      <Tabs defaultValue="reports">
        <TabsList>
          <TabsTrigger value="reports">
            <FileText className="mr-1.5 size-4" />
            Rapports
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="mr-1.5 size-4" />
            Paramètres
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reports">
          <ReportsListTab />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
