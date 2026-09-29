'use client'

import { useTranslations } from 'next-intl'

import { Building, LayoutGrid, Users } from 'lucide-react'

import { Tabs } from '@/components/ui/tabs'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { DepartmentsTab } from './departments-tab'
import { SectionsTab } from './sections-tab'
import { GroupsTab } from './groups-tab'

export default function OrganizationPage() {
  const t = useTranslations('organization')
  return (
    <PageMotion>
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
      />

      <Tabs defaultValue="departments">
        <PillsTabsList>
          <PillsTrigger value="departments" active="primary" icon={Building}>
            {t('tabs.departments')}
          </PillsTrigger>
          <PillsTrigger value="sections" active="teal" icon={LayoutGrid}>
            {t('tabs.sections')}
          </PillsTrigger>
          <PillsTrigger value="groups" active="sky" icon={Users}>
            {t('tabs.groups')}
          </PillsTrigger>
        </PillsTabsList>

        <TabPanel value="departments">
          <DepartmentsTab />
        </TabPanel>
        <TabPanel value="sections">
          <SectionsTab />
        </TabPanel>
        <TabPanel value="groups">
          <GroupsTab />
        </TabPanel>
      </Tabs>
    </PageMotion>
  )
}
