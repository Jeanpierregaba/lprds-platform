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
        <TabsList className="h-auto w-full gap-1.5 overflow-x-auto rounded-2xl bg-card p-1.5 shadow-soft ring-1 ring-border sm:w-fit">
          <TabsTrigger
            value="departments"
            className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:bg-primary data-active:text-white data-active:shadow-md"
          >
            <Building className="mr-1.5 size-4" />
            Départements
          </TabsTrigger>
          <TabsTrigger
            value="sections"
            className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:bg-teal data-active:text-white data-active:shadow-md"
          >
            <LayoutGrid className="mr-1.5 size-4" />
            Sections
          </TabsTrigger>
          <TabsTrigger
            value="groups"
            className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:bg-sky data-active:text-white data-active:shadow-md"
          >
            <Users className="mr-1.5 size-4" />
            Groupes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="departments">
          <motion.div
            key="departments"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <DepartmentsTab />
          </motion.div>
        </TabsContent>
        <TabsContent value="sections">
          <motion.div
            key="sections"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <SectionsTab />
          </motion.div>
        </TabsContent>
        <TabsContent value="groups">
          <motion.div
            key="groups"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <GroupsTab />
          </motion.div>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
