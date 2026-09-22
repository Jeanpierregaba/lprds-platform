'use client'

import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils/cn'

/** Conteneur des onglets pills (M3). */
export function PillsTabsList({ children, fit = true }: { children: ReactNode; fit?: boolean }) {
  return (
    <TabsList className={cn('h-auto w-full gap-1.5 overflow-x-auto rounded-2xl bg-card p-1.5 shadow-soft ring-1 ring-border', fit && 'sm:w-fit')}>
      {children}
    </TabsList>
  )
}

type PillsColor = 'primary' | 'teal' | 'sky' | 'orange' | 'navy' | 'destructive' | 'secondary'

const ACTIVE_CLASS: Record<PillsColor, string> = {
  primary: 'data-active:bg-primary data-active:text-white',
  teal: 'data-active:bg-teal data-active:text-white',
  sky: 'data-active:bg-sky data-active:text-white',
  orange: 'data-active:bg-orange data-active:text-white',
  navy: 'data-active:bg-navy data-active:text-white',
  destructive: 'data-active:bg-destructive data-active:text-white',
  secondary: 'data-active:bg-secondary data-active:text-white',
}

/** Onglet pill avec sa couleur active (M3). */
export function PillsTrigger({
  value, active, icon: Icon, children,
}: {
  value: string
  active: PillsColor
  icon?: LucideIcon
  children: ReactNode
}) {
  return (
    <TabsTrigger
      value={value}
      className={cn(
        'rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:shadow-md',
        ACTIVE_CLASS[active],
      )}
    >
      {Icon && <Icon className="mr-1.5 size-4" />}
      {children}
    </TabsTrigger>
  )
}

/** Contenu d'onglet avec fondu (M3). */
export function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsContent value={value}>
      <motion.div
        key={value}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </TabsContent>
  )
}
