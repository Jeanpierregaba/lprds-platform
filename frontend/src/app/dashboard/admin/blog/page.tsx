'use client'

import { motion } from 'framer-motion'
import { Newspaper, Tags } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ArticlesTab } from './articles-tab'
import { TagsTab } from './tags-tab'

export default function BlogPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div>
        <h1 className="text-2xl font-bold">Blog</h1>
        <p className="text-muted-foreground">Actualités du site vitrine — événements, projets pédagogiques.</p>
      </div>

      <Tabs defaultValue="articles">
        <TabsList>
          <TabsTrigger value="articles">
            <Newspaper className="mr-1.5 size-4" />
            Articles
          </TabsTrigger>
          <TabsTrigger value="tags">
            <Tags className="mr-1.5 size-4" />
            Étiquettes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="articles">
          <ArticlesTab />
        </TabsContent>
        <TabsContent value="tags">
          <TagsTab />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
