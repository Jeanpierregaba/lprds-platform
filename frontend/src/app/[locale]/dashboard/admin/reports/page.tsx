'use client'

import { Tabs } from '@/components/ui/tabs'
import { useLabel } from '@/lib/i18n/labels'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { TYPE_TAB_META, TypeTab } from './type-tab'

export default function ReportsPage() {
  const reportTypesLabel = useLabel('reportTypes')
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
              {reportTypesLabel(tab.value)}
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
