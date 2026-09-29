'use client'

import { ProfileSettingsTab } from '@/components/dashboard/profile-settings-tab'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'

export default function StaffSettingsPage() {
  return (
    <PageMotion className="max-w-2xl space-y-4">
      <PageHeader
        title="Paramètres"
        description="Gérer votre compte et vos préférences."
      />

      <ProfileSettingsTab />
    </PageMotion>
  )
}
