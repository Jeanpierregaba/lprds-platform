'use client'

import { Building, LayoutGrid, Users } from 'lucide-react'

import { Tabs } from '@/components/ui/tabs'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { DepartmentsTab } from './departments-tab'
import { SectionsTab } from './sections-tab'
import { GroupsTab } from './groups-tab'

export default function OrganizationPage() {
  return (
    <PageMotion>
      <PageHeader
        title="Organisation"
        description="Départements, sections et groupes de votre établissement."
      />

      <Tabs defaultValue="departments">
        <PillsTabsList>
          <PillsTrigger value="departments" active="primary" icon={Building}>
            Départements
          </PillsTrigger>
          <PillsTrigger value="sections" active="teal" icon={LayoutGrid}>
            Sections
          </PillsTrigger>
          <PillsTrigger value="groups" active="sky" icon={Users}>
            Groupes
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
