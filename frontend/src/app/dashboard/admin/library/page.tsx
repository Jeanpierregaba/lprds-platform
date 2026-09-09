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
        <TabsList>
          <TabsTrigger value="catalogue">
            <BookOpen className="mr-1.5 size-4" />
            Catalogue
          </TabsTrigger>
          <TabsTrigger value="lendings">
            <BookMarked className="mr-1.5 size-4" />
            Prêts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalogue">
          <CatalogueTab />
        </TabsContent>
        <TabsContent value="lendings">
          <LendingsTab />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
