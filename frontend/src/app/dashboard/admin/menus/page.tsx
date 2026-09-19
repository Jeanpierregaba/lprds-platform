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
        <TabsList className="h-auto w-full gap-1.5 overflow-x-auto rounded-2xl bg-card p-1.5 shadow-soft ring-1 ring-border sm:w-fit">
          <TabsTrigger
            value="week"
            className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:bg-primary data-active:text-white data-active:shadow-md"
          >
            <CalendarDays className="mr-1.5 size-4" />
            Semaine
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:bg-teal data-active:text-white data-active:shadow-md"
          >
            <History className="mr-1.5 size-4" />
            Historique
          </TabsTrigger>
        </TabsList>

        <TabsContent value="week">
          <motion.div
            key="week"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <WeekTab
              weekStart={weekStart} onWeekStartChange={setWeekStart}
              departmentId={departmentId} onDepartmentChange={setDepartmentId}
            />
          </motion.div>
        </TabsContent>
        <TabsContent value="history">
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <HistoryTab
              onSelectMenu={(ws, dep) => { setWeekStart(ws); setDepartmentId(dep); setTab('week') }}
            />
          </motion.div>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
