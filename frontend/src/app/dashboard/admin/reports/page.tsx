'use client'

import { Tabs } from '@/components/ui/tabs'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { REPORT_TYPE_LABELS } from '@/types/reports'
import { TYPE_TAB_META, TypeTab } from './type-tab'

export default function ReportsPage() {
  return (
    <PageMotion>
      <PageHeader
        title="Rapports"
        description="Rapports de vie des enfants quotidien, bi-mensuel, annuel."
      />

      <Tabs defaultValue="quotidien">
        <PillsTabsList>
          {TYPE_TAB_META.map((tab) => (
            <PillsTrigger key={tab.value} value={tab.value} active={tab.active} icon={tab.icon}>
              {REPORT_TYPE_LABELS[tab.value]}
            </PillsTrigger>
          ))}
        </PillsTabsList>

        {TYPE_TAB_META.map((tab) => (
          <TabPanel key={tab.value} value={tab.value}>
            <TypeTab reportType={tab.value} />
          </TabPanel>
        ))}
      </Tabs>
    </PageMotion>
  )
}
