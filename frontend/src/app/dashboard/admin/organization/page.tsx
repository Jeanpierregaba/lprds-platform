'use client'

import { motion } from 'framer-motion'
import { Building, LayoutGrid, Users } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DepartmentsTab } from './departments-tab'
import { SectionsTab } from './sections-tab'
import { GroupsTab } from './groups-tab'

export default function OrganizationPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div>
        <h1 className="text-2xl font-bold">Organisation</h1>
        <p className="text-muted-foreground">
          Départements, sections et groupes de votre établissement.
        </p>
      </div>

      <Tabs defaultValue="departments">
        <TabsList>
          <TabsTrigger value="departments">
            <Building className="mr-1.5 size-4" />
            Départements
          </TabsTrigger>
          <TabsTrigger value="sections">
            <LayoutGrid className="mr-1.5 size-4" />
            Sections
          </TabsTrigger>
          <TabsTrigger value="groups">
            <Users className="mr-1.5 size-4" />
            Groupes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="departments">
          <DepartmentsTab />
        </TabsContent>
        <TabsContent value="sections">
          <SectionsTab />
        </TabsContent>
        <TabsContent value="groups">
          <GroupsTab />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
