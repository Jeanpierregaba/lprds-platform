'use client'

import { motion } from 'framer-motion'
import { ShieldCheck, UserCog } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { RolesTab } from './roles-tab'
import { AssignmentTab } from './assignment-tab'

export default function RolesPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div>
        <h1 className="text-2xl font-bold">Rôles &amp; permissions</h1>
        <p className="text-muted-foreground">
          Définir les rôles de votre établissement et les attribuer à votre personnel.
        </p>
      </div>

      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles">
            <ShieldCheck className="mr-1.5 size-4" />
            Rôles
          </TabsTrigger>
          <TabsTrigger value="assignment">
            <UserCog className="mr-1.5 size-4" />
            Attribution
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roles">
          <RolesTab />
        </TabsContent>
        <TabsContent value="assignment">
          <AssignmentTab />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
