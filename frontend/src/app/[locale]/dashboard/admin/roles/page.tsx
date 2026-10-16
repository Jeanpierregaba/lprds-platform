'use client'

import { useTranslations } from 'next-intl'

import { ShieldCheck, UserCog } from 'lucide-react'

import { Tabs } from '@/components/ui/tabs'
import { ModuleGuard, PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { RolesTab } from './roles-tab'
import { AssignmentTab } from './assignment-tab'

export default function RolesPage() {
  const t = useTranslations('rbac')
  return (
    <PageMotion>
      <ModuleGuard adminOnly>
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
      />

      <Tabs defaultValue="roles">
        <PillsTabsList>
          <PillsTrigger value="roles" active="primary" icon={ShieldCheck}>
            {t('tabs.roles')}
          </PillsTrigger>
          <PillsTrigger value="assignment" active="teal" icon={UserCog}>
            {t('tabs.assignment')}
          </PillsTrigger>
        </PillsTabsList>

        <TabPanel value="roles">
          <RolesTab />
        </TabPanel>
        <TabPanel value="assignment">
          <AssignmentTab />
        </TabPanel>
      </Tabs>
      </ModuleGuard>
    </PageMotion>
  )
}
