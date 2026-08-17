'use client'

import { motion } from 'framer-motion'
import { ProfileSettingsTab } from '@/components/dashboard/profile-settings-tab'

export default function ParentSettingsPage() {
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

      <ProfileSettingsTab />
    </motion.div>
  )
}
