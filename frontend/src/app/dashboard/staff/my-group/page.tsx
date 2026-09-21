'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Baby } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { childrenApi } from '@/lib/api/children.api'
import { cn } from '@/lib/utils/cn'
import type { ChildListItem } from '@/types/children'

function childAgeLabel(birthIso: string): string {
  const birth = new Date(birthIso)
  const now = new Date()
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth())
  if (now.getDate() < birth.getDate()) months -= 1
  if (months < 1) {
    const days = Math.max(0, Math.floor((now.getTime() - birth.getTime()) / 86400000))
    return `${days} jour${days > 1 ? 's' : ''}`
  }
  const years = Math.floor(months / 12)
  const rest = months % 12
  if (years === 0) return `${months} mois`
  return rest === 0 ? `${years} an${years > 1 ? 's' : ''}` : `${years} an${years > 1 ? 's' : ''} ${rest} mois`
}

export default function StaffMyGroupPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['staff', 'children', 'my-group'],
    queryFn: () => childrenApi.listMyGroup().then((r) => r.data),
  })

  const items = data?.items ?? []

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div>
        <h1 className="text-2xl font-bold">Mon Groupe</h1>
        <p className="text-muted-foreground">Enfants du/des groupe(s) dont vous êtes l&apos;éducatrice.</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-2 p-5">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-40" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex h-56 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Baby className="size-5" />
            </div>
            <p className="font-medium text-foreground">Aucun groupe ne vous est encore assigné.</p>
            <p className="max-w-sm text-sm">
              Contactez l&apos;administration pour être désigné(e) éducatrice responsable d&apos;un groupe.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((child: ChildListItem, i: number) => (
            <motion.div
              key={child.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.05 }}
            >
              <Card className={cn('rounded-2xl shadow-soft transition hover:-translate-y-0.5', !child.is_active && 'opacity-75')}>
                <CardContent className="space-y-1.5 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-display text-xl font-semibold leading-tight">
                      {child.first_names} {child.last_name}
                    </p>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                        child.is_active ? 'bg-pale-green text-white' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {child.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Code: <span className="font-mono">{child.matricule}</span>
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">Âge:</span> {childAgeLabel(child.birth_date)}
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">Section:</span>{' '}
                    {child.section?.name ?? child.department?.name ?? '—'}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
