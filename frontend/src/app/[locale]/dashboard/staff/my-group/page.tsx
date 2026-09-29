'use client'

import { useTranslations } from 'next-intl'

import { useQuery } from '@tanstack/react-query'
import { Baby } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { childrenApi } from '@/lib/api/children.api'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { CardsEmptyState, CardsGrid, CardsSkeleton, StaggerItem, StatusPill } from '@/components/dashboard/shared/cards'
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
  const t = useTranslations('admin')
  const { data, isLoading } = useQuery({
    queryKey: ['staff', 'children', 'my-group'],
    queryFn: () => childrenApi.listMyGroup().then((r) => r.data),
  })

  const items = data?.items ?? []

  return (
    <PageMotion>
      <PageHeader
        title={t('portals.myGroup')}
        description={t('portals.myGroupHint')}
      />

      {isLoading ? (
        <CardsSkeleton />
      ) : items.length === 0 ? (
        <CardsEmptyState
          icon={Baby}
          title="Aucun groupe ne vous est encore assigné."
          description={t('portals.myGroupHint')}
        />
      ) : (
        <CardsGrid>
          {items.map((child: ChildListItem, i: number) => (
            <StaggerItem key={child.id} index={i}>
              <Card className="rounded-2xl shadow-soft transition hover:-translate-y-0.5">
                <CardContent className="space-y-1.5 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 break-words font-display text-xl font-semibold leading-tight">
                      {child.first_names} {child.last_name}
                    </p>
                    <StatusPill active={child.is_active} shrink />
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
            </StaggerItem>
          ))}
        </CardsGrid>
      )}
    </PageMotion>
  )
}
