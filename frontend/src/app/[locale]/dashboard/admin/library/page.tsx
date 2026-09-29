'use client'

import { BookMarked, BookOpen } from 'lucide-react'

import { Tabs } from '@/components/ui/tabs'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { CatalogueTab } from './catalogue-tab'
import { LendingsTab } from './lendings-tab'

export default function LibraryPage() {
  return (
    <PageMotion>
      <PageHeader
        title="Bibliothèque"
        description="Catalogue des livres, prêts aux enfants et rappels de retour."
      />

      <Tabs defaultValue="catalogue">
        <PillsTabsList>
          <PillsTrigger value="catalogue" active="primary" icon={BookOpen}>
            Catalogue
          </PillsTrigger>
          <PillsTrigger value="lendings" active="teal" icon={BookMarked}>
            Prêts
          </PillsTrigger>
        </PillsTabsList>

        <TabPanel value="catalogue">
          <CatalogueTab />
        </TabPanel>
        <TabPanel value="lendings">
          <LendingsTab />
        </TabPanel>
      </Tabs>
    </PageMotion>
  )
}
