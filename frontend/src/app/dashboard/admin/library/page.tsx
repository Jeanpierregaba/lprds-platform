'use client'

import { motion } from 'framer-motion'
import { BookMarked, BookOpen } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CatalogueTab } from './catalogue-tab'
import { LendingsTab } from './lendings-tab'

export default function LibraryPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div>
        <h1 className="text-2xl font-bold">Bibliothèque</h1>
        <p className="text-muted-foreground">
          Catalogue des livres, prêts aux enfants et rappels de retour.
        </p>
      </div>

      <Tabs defaultValue="catalogue">
        <TabsList className="h-auto w-full gap-1.5 overflow-x-auto rounded-2xl bg-card p-1.5 shadow-soft ring-1 ring-border sm:w-fit">
          <TabsTrigger
            value="catalogue"
            className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:bg-primary data-active:text-white data-active:shadow-md"
          >
            <BookOpen className="mr-1.5 size-4" />
            Catalogue
          </TabsTrigger>
          <TabsTrigger
            value="lendings"
            className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:bg-teal data-active:text-white data-active:shadow-md"
          >
            <BookMarked className="mr-1.5 size-4" />
            Prêts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalogue">
          <motion.div
            key="catalogue"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <CatalogueTab />
          </motion.div>
        </TabsContent>
        <TabsContent value="lendings">
          <motion.div
            key="lendings"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <LendingsTab />
          </motion.div>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
