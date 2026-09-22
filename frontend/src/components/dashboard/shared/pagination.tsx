'use client'

import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'

/** Pied de liste paginée : compteur + Précédent/Suivant (M11). */
export function ListPagination({
  label, skip, pageSize, total, onSkipChange,
}: {
  label: ReactNode
  skip: number
  pageSize: number
  total: number
  onSkipChange: (skip: number) => void
}) {
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>{label}</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={skip <= 0} onClick={() => onSkipChange(Math.max(0, skip - pageSize))}>
          Précédent
        </Button>
        <Button variant="outline" size="sm" disabled={skip + pageSize >= total} onClick={() => onSkipChange(skip + pageSize)}>
          Suivant
        </Button>
      </div>
    </div>
  )
}
