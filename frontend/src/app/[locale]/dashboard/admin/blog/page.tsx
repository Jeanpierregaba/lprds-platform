'use client'

import { useTranslations } from 'next-intl'

import { Images, Newspaper, Tags } from 'lucide-react'

import { Tabs } from '@/components/ui/tabs'
import { ModuleGuard, PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { ArticlesTab } from './articles-tab'
import { TagsTab } from './tags-tab'
import { GalleryTab } from './gallery-tab'

export default function BlogPage() {
  const t = useTranslations('blog')
  return (
    <PageMotion>
      <ModuleGuard anyOf={['blog:write']}>
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
      />

      <Tabs defaultValue="articles">
        <PillsTabsList>
          <PillsTrigger value="articles" active="primary" icon={Newspaper}>
            {t('tabs.articles')}
          </PillsTrigger>
          <PillsTrigger value="tags" active="teal" icon={Tags}>
            {t('tabs.tags')}
          </PillsTrigger>
          <PillsTrigger value="gallery" active="sky" icon={Images}>
            {t('tabs.gallery')}
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
      </ModuleGuard>
    </PageMotion>
  )
}
