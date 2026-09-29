'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'
import { CalendarDays, History } from 'lucide-react'

import { Tabs } from '@/components/ui/tabs'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { WeekTab } from './week-tab'
import { HistoryTab } from './history-tab'
import { mondayOf, toIsoDate } from '@/lib/utils/dates'

export default function MenusPage() {
  const t = useTranslations('menus')
  const [weekStart, setWeekStart] = useState(() => toIsoDate(mondayOf(new Date())))
  const [departmentId, setDepartmentId] = useState('')
  const [tab, setTab] = useState('week')

  return (
    <PageMotion>
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
      />

      <Tabs value={tab} onValueChange={(v) => v && setTab(v)}>
        <PillsTabsList>
          <PillsTrigger value="week" active="primary" icon={CalendarDays}>
            {t('tabs.week')}
          </PillsTrigger>
          <PillsTrigger value="history" active="teal" icon={History}>
            {t('tabs.history')}
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
