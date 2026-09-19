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
        <TabsList className="h-auto w-full gap-1.5 overflow-x-auto rounded-2xl bg-card p-1.5 shadow-soft ring-1 ring-border sm:w-fit">
          <TabsTrigger
            value="roles"
            className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:bg-primary data-active:text-white data-active:shadow-md"
          >
            <ShieldCheck className="mr-1.5 size-4" />
            Rôles
          </TabsTrigger>
          <TabsTrigger
            value="assignment"
            className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:bg-teal data-active:text-white data-active:shadow-md"
          >
            <UserCog className="mr-1.5 size-4" />
            Attribution
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roles">
          <motion.div
            key="roles"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <RolesTab />
          </motion.div>
        </TabsContent>
        <TabsContent value="assignment">
          <motion.div
            key="assignment"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <AssignmentTab />
          </motion.div>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
