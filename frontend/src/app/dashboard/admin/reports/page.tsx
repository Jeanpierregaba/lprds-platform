'use client'

import { motion } from 'framer-motion'

import { ReportsListTab } from './reports-list-tab'

export default function ReportsPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div>
        <h1 className="text-2xl font-bold">Rapports</h1>
        <p className="text-muted-foreground">Rapports de vie des enfants — quotidien, bi-mensuel, annuel.</p>
      </div>

      <ReportsListTab />
    </motion.div>
  )
}
