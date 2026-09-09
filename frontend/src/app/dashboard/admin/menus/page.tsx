'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, History } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { WeekTab } from './week-tab'
import { HistoryTab } from './history-tab'
import { mondayOf, toIsoDate } from '@/lib/utils/dates'

export default function MenusPage() {
  const [weekStart, setWeekStart] = useState(() => toIsoDate(mondayOf(new Date())))
  const [departmentId, setDepartmentId] = useState('')
  const [tab, setTab] = useState('week')

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div>
        <h1 className="text-2xl font-bold">Menus</h1>
        <p className="text-muted-foreground">Menu hebdomadaire — collation, déjeuner, dessert, goûter.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => v && setTab(v)}>
        <TabsList>
          <TabsTrigger value="week">
            <CalendarDays className="mr-1.5 size-4" />
            Semaine
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="mr-1.5 size-4" />
            Historique
          </TabsTrigger>
        </TabsList>

        <TabsContent value="week">
          <WeekTab
            weekStart={weekStart} onWeekStartChange={setWeekStart}
            departmentId={departmentId} onDepartmentChange={setDepartmentId}
          />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab
            onSelectMenu={(ws, dep) => { setWeekStart(ws); setDepartmentId(dep); setTab('week') }}
          />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
