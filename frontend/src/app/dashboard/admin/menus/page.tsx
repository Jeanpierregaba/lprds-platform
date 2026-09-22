'use client'

import { useState } from 'react'
import { CalendarDays, History } from 'lucide-react'

import { Tabs } from '@/components/ui/tabs'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { WeekTab } from './week-tab'
import { HistoryTab } from './history-tab'
import { mondayOf, toIsoDate } from '@/lib/utils/dates'

export default function MenusPage() {
  const [weekStart, setWeekStart] = useState(() => toIsoDate(mondayOf(new Date())))
  const [departmentId, setDepartmentId] = useState('')
  const [tab, setTab] = useState('week')

  return (
    <PageMotion>
      <PageHeader
        title="Menus"
        description="Menu hebdomadaire — collation, déjeuner, dessert, goûter."
      />

      <Tabs value={tab} onValueChange={(v) => v && setTab(v)}>
        <PillsTabsList>
          <PillsTrigger value="week" active="primary" icon={CalendarDays}>
            Semaine
          </PillsTrigger>
          <PillsTrigger value="history" active="teal" icon={History}>
            Historique
          </PillsTrigger>
        </PillsTabsList>

        <TabPanel value="week">
          <WeekTab
            weekStart={weekStart} onWeekStartChange={setWeekStart}
            departmentId={departmentId} onDepartmentChange={setDepartmentId}
          />
        </TabPanel>
        <TabPanel value="history">
          <HistoryTab
            onSelectMenu={(ws, dep) => { setWeekStart(ws); setDepartmentId(dep); setTab('week') }}
          />
        </TabPanel>
      </Tabs>
    </PageMotion>
  )
}
