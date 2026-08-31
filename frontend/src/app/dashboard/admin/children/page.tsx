'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Baby, LayoutGrid, List, Plus, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { childrenApi } from '@/lib/api/children.api'
import { organizationApi } from '@/lib/api/organization.api'
import { cn } from '@/lib/utils'
import type { ChildListItem } from '@/types/children'

function initials(firstNames: string, lastName: string) {
  return `${firstNames[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
}

const PAGE_SIZE = 20
const ALL = '__all__'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR')
}

export default function ChildrenListPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [departmentId, setDepartmentId] = useState<string>(ALL)
  const [sectionId, setSectionId] = useState<string>(ALL)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [skip, setSkip] = useState(0)
  const [view, setView] = useState<'table' | 'cards'>('table')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => setSkip(0), [debouncedSearch, departmentId, sectionId, includeInactive])
  useEffect(() => setSectionId(ALL), [departmentId])

  const { data: departments } = useQuery({
    queryKey: ['departments', { includeInactive: false }],
    queryFn: () => organizationApi.listDepartments(false).then((r) => r.data),
  })

  const { data: sections } = useQuery({
    queryKey: ['sections', { departmentId, includeInactive: false }],
    queryFn: () =>
      organizationApi
        .listSections({ department_id: departmentId === ALL ? undefined : departmentId, include_inactive: false })
        .then((r) => r.data),
  })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['children', { search: debouncedSearch, departmentId, sectionId, includeInactive, skip }],
    queryFn: () =>
      childrenApi
        .list({
          search: debouncedSearch || undefined,
          department_id: departmentId === ALL ? undefined : departmentId,
          section_id: sectionId === ALL ? undefined : sectionId,
          include_inactive: includeInactive,
          skip,
          limit: PAGE_SIZE,
        })
        .then((r) => r.data),
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []
  const hasNext = skip + PAGE_SIZE < total
  const hasPrev = skip > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Enfants</h1>
          <p className="text-muted-foreground">Gérer les fiches des enfants de votre établissement.</p>
        </div>
        <Button render={<Link href="/dashboard/admin/children/new" />}>
          <Plus className="mr-1.5 size-4" />
          Nouvelle fiche
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, prénoms ou matricule..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          items={{ [ALL]: 'Tous les départements', ...Object.fromEntries((departments ?? []).map((d) => [d.id, d.name])) }}
          value={departmentId}
          onValueChange={(v) => setDepartmentId(v ?? ALL)}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Tous les départements" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les départements</SelectItem>
            {departments?.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={{ [ALL]: 'Toutes les sections', ...Object.fromEntries((sections ?? []).map((s) => [s.id, s.name])) }}
          value={sectionId}
          onValueChange={(v) => setSectionId(v ?? ALL)}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Toutes les sections" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toutes les sections</SelectItem>
            {sections?.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="include-inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} />
          <Label htmlFor="include-inactive" className="text-sm">Inclure les fiches inactives</Label>
        </div>

        <div className="ml-auto flex items-center gap-1 rounded-md border border-border p-0.5">
          <Button
            type="button"
            variant={view === 'table' ? 'secondary' : 'ghost'}
            size="icon-sm"
            aria-label="Vue en liste"
            aria-pressed={view === 'table'}
            onClick={() => setView('table')}
          >
            <List className="size-4" />
          </Button>
          <Button
            type="button"
            variant={view === 'cards' ? 'secondary' : 'ghost'}
            size="icon-sm"
            aria-label="Vue en cartes"
            aria-pressed={view === 'cards'}
            onClick={() => setView('cards')}
          >
            <LayoutGrid className="size-4" />
          </Button>
        </div>
      </div>

      {view === 'cards' ? (
        <ChildrenCardGrid
          items={items}
          isLoading={isLoading}
          hasSearch={!!debouncedSearch}
        />
      ) : (
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Matricule</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Naissance</TableHead>
                <TableHead>Département</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="h-56 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <Baby className="size-5" />
                      </div>
                      <p className="font-medium text-foreground">
                        {debouncedSearch ? 'Aucun résultat pour cette recherche.' : 'Aucune fiche enfant pour le moment.'}
                      </p>
                      <p className="max-w-sm text-sm">
                        {debouncedSearch
                          ? 'Essayez un autre nom, prénom ou matricule.'
                          : 'Créez la première fiche pour commencer à gérer les enfants.'}
                      </p>
                      {!debouncedSearch && (
                        <Button render={<Link href="/dashboard/admin/children/new" />} size="sm" className="mt-1">
                          <Plus className="mr-1.5 size-4" />
                          Nouvelle fiche
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((child) => (
                  <TableRow key={child.id}>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/admin/children/${child.id}`} className="block p-2 font-mono text-xs">
                        {child.matricule}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/admin/children/${child.id}`} className="block p-2 font-medium">
                        {child.first_names} {child.last_name}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/admin/children/${child.id}`} className="block p-2 text-muted-foreground">
                        {formatDate(child.birth_date)}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/admin/children/${child.id}`} className="block p-2 text-muted-foreground">
                        {child.department?.name ?? '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/admin/children/${child.id}`} className="block p-2 text-muted-foreground">
                        {child.section?.name ?? '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/admin/children/${child.id}`} className="block p-2">
                        <Badge variant={child.is_active ? 'default' : 'outline'}>
                          {child.is_active ? 'Actif' : 'Inactif'}
                        </Badge>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} enfant{total > 1 ? 's' : ''} {isFetching && !isLoading && '· actualisation...'}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>
            Précédent
          </Button>
          <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setSkip(skip + PAGE_SIZE)}>
            Suivant
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

function ChildrenCardGrid({
  items, isLoading, hasSearch,
}: { items: ChildListItem[]; isLoading: boolean; hasSearch: boolean }) {
  if (isLoading) {
    return (
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
    )
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-56 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Baby className="size-5" />
          </div>
          <p className="font-medium text-foreground">
            {hasSearch ? 'Aucun résultat pour cette recherche.' : 'Aucune fiche enfant pour le moment.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((child) => (
        <Link key={child.id} href={`/dashboard/admin/children/${child.id}`}>
          <Card className={cn('h-full transition-colors hover:bg-muted/50', !child.is_active && 'opacity-70')}>
            <CardContent className="flex items-start gap-3 p-4">
              <Avatar size="lg">
                <AvatarFallback>{initials(child.first_names, child.last_name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-medium">{child.first_names} {child.last_name}</p>
                  <Badge variant={child.is_active ? 'default' : 'outline'} className="shrink-0">
                    {child.is_active ? 'Actif' : 'Inactif'}
                  </Badge>
                </div>
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
        </Link>
      ))}
    </div>
  )
}
