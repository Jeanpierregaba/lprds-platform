'use client'

import { motion } from 'framer-motion'
import { Images, Newspaper, Tags } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ArticlesTab } from './articles-tab'
import { TagsTab } from './tags-tab'
import { GalleryTab } from './gallery-tab'

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
        <TabsList className="h-auto w-full gap-1.5 overflow-x-auto rounded-2xl bg-card p-1.5 shadow-soft ring-1 ring-border sm:w-fit">
          <TabsTrigger
            value="articles"
            className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:bg-primary data-active:text-white data-active:shadow-md"
          >
            <Newspaper className="mr-1.5 size-4" />
            Articles
          </TabsTrigger>
          <TabsTrigger
            value="tags"
            className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:bg-teal data-active:text-white data-active:shadow-md"
          >
            <Tags className="mr-1.5 size-4" />
            Étiquettes
          </TabsTrigger>
          <TabsTrigger
            value="gallery"
            className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:bg-sky data-active:text-white data-active:shadow-md"
          >
            <Images className="mr-1.5 size-4" />
            Galerie
          </TabsTrigger>
        </TabsList>

        <TabsContent value="articles">
          <motion.div
            key="articles"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <ArticlesTab />
          </motion.div>
        </TabsContent>
        <TabsContent value="tags">
          <motion.div
            key="tags"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <TagsTab />
          </motion.div>
        </TabsContent>
        <TabsContent value="gallery">
          <motion.div
            key="gallery"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <GalleryTab />
          </motion.div>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
