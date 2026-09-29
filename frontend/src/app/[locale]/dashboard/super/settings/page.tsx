'use client'

import { useTranslations } from 'next-intl'

import { motion } from 'framer-motion'
import { User } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ProfileSettingsTab } from '@/components/dashboard/profile-settings-tab'

export default function SuperadminSettingsPage() {
  const t = useTranslations('admin')
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="max-w-2xl space-y-4"
    >
      <div>
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <p className="text-muted-foreground">Gérer votre compte et vos préférences.</p>
      </div>

      <Tabs defaultValue="profil">
        <TabsList>
          <TabsTrigger value="profil">
            <User className="mr-1.5 size-4" />
            {t('settings.tabs.profil')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profil">
          <ProfileSettingsTab />
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
