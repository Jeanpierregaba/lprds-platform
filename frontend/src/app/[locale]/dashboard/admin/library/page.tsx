'use client'

import { useTranslations } from 'next-intl'

import { BookMarked, BookOpen } from 'lucide-react'

import { Tabs } from '@/components/ui/tabs'
import { ModuleGuard, PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { CatalogueTab } from './catalogue-tab'
import { LendingsTab } from './lendings-tab'

export default function LibraryPage() {
  const t = useTranslations('library')
  return (
    <PageMotion>
      <ModuleGuard anyOf={['library:read', 'library:write', 'library:lend']}>
      <PageHeader
        title={t('page.title')}
        description={t('page.description')}
      />

      <Tabs defaultValue="catalogue">
        <PillsTabsList>
          <PillsTrigger value="catalogue" active="primary" icon={BookOpen}>
            {t('tabs.catalogue')}
          </PillsTrigger>
          <PillsTrigger value="lendings" active="teal" icon={BookMarked}>
            {t('tabs.lendings')}
          </PillsTrigger>
        </PillsTabsList>

        <TabPanel value="catalogue">
          <CatalogueTab />
        </TabPanel>
        <TabPanel value="lendings">
          <LendingsTab />
        </TabPanel>
      </Tabs>
      </ModuleGuard>
    </PageMotion>
  )
}
