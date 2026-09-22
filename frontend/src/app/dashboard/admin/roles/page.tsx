'use client'

import { ShieldCheck, UserCog } from 'lucide-react'

import { Tabs } from '@/components/ui/tabs'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { RolesTab } from './roles-tab'
import { AssignmentTab } from './assignment-tab'

export default function RolesPage() {
  return (
    <PageMotion>
      <PageHeader
        title="Rôles & permissions"
        description="Définir les rôles de votre établissement et les attribuer à votre personnel."
      />

      <Tabs defaultValue="roles">
        <PillsTabsList>
          <PillsTrigger value="roles" active="primary" icon={ShieldCheck}>
            Rôles
          </PillsTrigger>
          <PillsTrigger value="assignment" active="teal" icon={UserCog}>
            Attribution
          </PillsTrigger>
        </PillsTabsList>

        <TabPanel value="roles">
          <RolesTab />
        </TabPanel>
        <TabPanel value="assignment">
          <AssignmentTab />
        </TabPanel>
      </Tabs>
    </PageMotion>
  )
}
