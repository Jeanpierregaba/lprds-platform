'use client'

import { Images, Newspaper, Tags } from 'lucide-react'

import { Tabs } from '@/components/ui/tabs'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { ArticlesTab } from './articles-tab'
import { TagsTab } from './tags-tab'
import { GalleryTab } from './gallery-tab'

export default function BlogPage() {
  return (
    <PageMotion>
      <PageHeader
        title="Blog"
        description="Actualités du site vitrine — événements, projets pédagogiques."
      />

      <Tabs defaultValue="articles">
        <PillsTabsList>
          <PillsTrigger value="articles" active="primary" icon={Newspaper}>
            Articles
          </PillsTrigger>
          <PillsTrigger value="tags" active="teal" icon={Tags}>
            Étiquettes
          </PillsTrigger>
          <PillsTrigger value="gallery" active="sky" icon={Images}>
            Galerie
          </PillsTrigger>
        </PillsTabsList>

        <TabPanel value="articles">
          <ArticlesTab />
        </TabPanel>
        <TabPanel value="tags">
          <TagsTab />
        </TabPanel>
        <TabPanel value="gallery">
          <GalleryTab />
        </TabPanel>
      </Tabs>
    </PageMotion>
  )
}
