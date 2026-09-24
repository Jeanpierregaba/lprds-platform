'use client'

import type { ReactNode } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils/cn'

/** Coquille tableau à en-tête primary (M7). `footer` est rendu dans la
 * carte, sous le tableau (ex. pagination interne du dashboard présences).
 * Le conteneur `overflow-x-auto` rend les tableaux larges swipables sur
 * mobile au lieu de déborder de la page. */
export function DataTable({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table className="border-collapse">{children}</Table>
        </div>
        {footer}
      </CardContent>
    </Card>
  )
}

export function DataTableHead({ children }: { children: ReactNode }) {
  return (
    <TableHeader className="bg-primary [&_tr]:border-transparent">
      <TableRow className="bg-primary hover:bg-primary">{children}</TableRow>
    </TableHeader>
  )
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <TableHead className={cn('px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground', className)}>
      {children}
    </TableHead>
  )
}

export function Td({ children, className, colSpan }: { children: ReactNode; className?: string; colSpan?: number }) {
  return <TableCell colSpan={colSpan} className={cn('px-5 py-4', className)}>{children}</TableCell>
}

/** Lignes de chargement — `widths` = classes des skeletons par colonne (M9-a).
 * Une chaîne vide rend une cellule vide (colonnes d'actions). */
export function TableSkeletonRows({ count = 6, widths }: { count?: number; widths: string[] }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <TableRow key={i}>
          {widths.map((w, j) => (
            <Td key={j}>{w ? <Skeleton className={w} /> : null}</Td>
          ))}
        </TableRow>
      ))}
    </>
  )
}

export { TableBody }
