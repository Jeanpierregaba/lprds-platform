'use client'

import { useTranslations } from 'next-intl'

import { ProfileSettingsTab } from '@/components/dashboard/profile-settings-tab'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'

export default function ParentSettingsPage() {
  const t = useTranslations('admin')
  return (
    <PageMotion className="max-w-2xl space-y-4">
      <PageHeader
        title={t('portals.settings')}
        description={t('portals.settingsHint')}
      />

      <ProfileSettingsTab />
    </PageMotion>
  )
}
