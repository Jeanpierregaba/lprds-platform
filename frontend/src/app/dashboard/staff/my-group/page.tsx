'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Baby } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { childrenApi } from '@/lib/api/children.api'
import type { ChildListItem } from '@/types/children'

function initials(firstNames: string, lastName: string) {
  return `${firstNames[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
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
              <CardContent className="flex items-center gap-3 p-4">
                <Skeleton className="size-10 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
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
          {items.map((child: ChildListItem) => (
            <Card key={child.id}>
              <CardContent className="flex items-start gap-3 p-4">
                <Avatar size="lg">
                  <AvatarFallback>{initials(child.first_names, child.last_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate font-medium">{child.first_names} {child.last_name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{child.matricule}</p>
                  <p className="text-xs text-muted-foreground">
                    Né(e) le {new Date(child.birth_date).toLocaleDateString('fr-FR')}
                  </p>
                  {(child.department || child.section) && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {child.department && (
                        <Badge variant="outline" className="font-normal">{child.department.name}</Badge>
                      )}
                      {child.section && (
                        <Badge variant="outline" className="font-normal">{child.section.name}</Badge>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  )
}
