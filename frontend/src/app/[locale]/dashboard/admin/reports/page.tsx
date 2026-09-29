'use client'

import { useTranslations } from 'next-intl'

import { Tabs } from '@/components/ui/tabs'
import { useLabel } from '@/lib/i18n/labels'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { TYPE_TAB_META, TypeTab } from './type-tab'

export default function ReportsPage() {
  const t = useTranslations('reports')
  const reportTypesLabel = useLabel('reportTypes')
  return (
    <PageMotion>
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
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
