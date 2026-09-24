'use client'

import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'

/** Pied de liste paginée : compteur + Précédent/Suivant (M11). Boutons 40px
 * pour rester tappables au doigt. */
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
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>{label}</span>
      <div className="flex gap-2">
        <Button variant="outline" className="h-10" disabled={skip <= 0} onClick={() => onSkipChange(Math.max(0, skip - pageSize))}>
          Précédent
        </Button>
        <Button variant="outline" className="h-10" disabled={skip + pageSize >= total} onClick={() => onSkipChange(skip + pageSize)}>
          Suivant
        </Button>
      </div>
    </div>
  )
}
