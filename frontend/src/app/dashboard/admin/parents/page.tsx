'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Eye, LayoutGrid, List, Loader2, Plus, Search, UserCheck, Users, UserX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { parentsApi } from '@/lib/api/parents.api'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { cn } from '@/lib/utils/cn'
import type { ParentListItem } from '@/types/parents'

const PAGE_SIZE = 20

export default function ParentsListPage() {
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('parents:write')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [skip, setSkip] = useState(0)
  const [view, setView] = useState<'table' | 'cards'>('cards')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => setSkip(0), [debouncedSearch, includeInactive])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['parents', { search: debouncedSearch, includeInactive, skip }],
    queryFn: () =>
      parentsApi
        .list({ search: debouncedSearch || undefined, include_inactive: includeInactive, skip, limit: PAGE_SIZE })
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
          <h1 className="text-2xl font-bold">Parents</h1>
          <p className="text-muted-foreground">Gérer les comptes parents connectables.</p>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && (
          <Button render={<Link href="/dashboard/admin/parents/new" />}>
            <Plus className="mr-1.5 size-4" />
            Nouveau compte parent
          </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, surnom ou email..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="include-inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} />
          <Label htmlFor="include-inactive" className="text-sm text-white font-semibold">Inclure les comptes inactifs</Label>
        </div>

        <div className="ml-auto flex items-center gap-1 rounded-md border border-border p-0.5 bg-accent">
          <Button
            type="button"
            variant={view === 'table' ? 'default' : 'ghost'}
            size="icon-sm"
            aria-label="Vue en liste"
            aria-pressed={view === 'table'}
            onClick={() => setView('table')}
          >
            <List className="size-4" />
          </Button>
          <Button
            type="button"
            variant={view === 'cards' ? 'default' : 'ghost'}
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
        <ParentsCardGrid
          items={items}
          isLoading={isLoading}
          hasSearch={!!debouncedSearch}
        />
      ) : (
      <Card className="overflow-hidden py-0">
        <CardContent className="p-0">
          <Table className="border-collapse">
            <TableHeader className="bg-primary [&_tr]:border-transparent">
              <TableRow className="bg-primary hover:bg-primary">
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Nom</TableHead>
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Email</TableHead>
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Téléphone</TableHead>
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Enfants</TableHead>
                <TableHead className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-primary-foreground">Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-5 py-4"><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell className="px-5 py-4"><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell className="px-5 py-4"><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell className="px-5 py-4"><Skeleton className="h-4 w-10" /></TableCell>
                    <TableCell className="px-5 py-4"><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="h-56 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <Users className="size-5" />
                      </div>
                      <p className="font-medium text-foreground">
                        {debouncedSearch ? 'Aucun résultat pour cette recherche.' : 'Aucun compte parent pour le moment.'}
                      </p>
                      <p className="max-w-sm text-sm">
                        {debouncedSearch
                          ? 'Essayez un autre nom, surnom ou email.'
                          : 'Créez le premier compte pour donner accès à un parent.'}
                      </p>
                      {!debouncedSearch && canWrite && (
                        <Button render={<Link href="/dashboard/admin/parents/new" />} size="sm" className="mt-1">
                          <Plus className="mr-1.5 size-4" />
                          Nouveau compte parent
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((p) => (
                  <TableRow key={p.id} className={cn(!p.is_active && 'opacity-70')}>
                    <TableCell className="px-5 py-4">
                      <Link href={`/dashboard/admin/parents/${p.id}`} className="block font-medium">
                        {p.nickname ?? `${p.first_name} ${p.last_name}`}
                      </Link>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <Link href={`/dashboard/admin/parents/${p.id}`} className="block text-muted-foreground">
                        {p.email}
                      </Link>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <Link href={`/dashboard/admin/parents/${p.id}`} className="block text-muted-foreground">
                        {p.phone ?? '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <Link href={`/dashboard/admin/parents/${p.id}`} className="block text-muted-foreground">
                        {p.children_count}
                      </Link>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <Link href={`/dashboard/admin/parents/${p.id}`} className="block">
                        <span
                          className={cn(
                            'inline-block rounded-full px-3 py-1 text-xs font-semibold',
                            p.is_active ? 'bg-pale-green text-white' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {p.is_active ? 'Actif' : 'Inactif'}
                        </span>
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
          {total} parent{total > 1 ? 's' : ''} {isFetching && !isLoading && '· actualisation...'}
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

function ParentsCardGrid({
  items, isLoading, hasSearch,
}: { items: ParentListItem[]; isLoading: boolean; hasSearch: boolean }) {
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('parents:write')

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-2 p-5">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-24" />
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
            <Users className="size-5" />
          </div>
          <p className="font-medium text-foreground">
            {hasSearch ? 'Aucun résultat pour cette recherche.' : 'Aucun compte parent pour le moment.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((parent, i) => (
        <motion.div
          key={parent.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.05 }}
        >
          <ParentCard parent={parent} canWrite={canWrite} />
        </motion.div>
      ))}
    </div>
  )
}

function ParentCard({
  parent, canWrite,
}: {
  parent: ParentListItem
  canWrite: boolean
}) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const detailHref = `/dashboard/admin/parents/${parent.id}`
  const [confirmToggle, setConfirmToggle] = useState(false)

  const toggleMutation = useMutation({
    mutationFn: () => parentsApi.update(parent.id, { is_active: !parent.is_active }),
    onSuccess: () => {
      toast.success(parent.is_active ? 'Compte désactivé.' : 'Compte réactivé.')
      queryClient.invalidateQueries({ queryKey: ['parents'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  return (
    <>
      <Card
        className={cn('cursor-pointer rounded-2xl shadow-soft transition hover:-translate-y-0.5', !parent.is_active && 'opacity-75')}
        onClick={() => router.push(detailHref)}
        onKeyDown={(e) => { if (e.key === 'Enter') router.push(detailHref) }}
        tabIndex={0}
        role="link"
        aria-label={`Ouvrir le compte de ${parent.nickname ?? `${parent.first_name} ${parent.last_name}`}`}
      >
      <CardContent className="space-y-1.5 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-xl font-semibold leading-tight">
            {parent.nickname ?? `${parent.first_name} ${parent.last_name}`}
          </p>
          <span
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
              parent.is_active ? 'bg-pale-green text-white' : 'bg-muted text-muted-foreground',
            )}
          >
            {parent.is_active ? 'Actif' : 'Inactif'}
          </span>
        </div>
        <p className="truncate text-sm text-muted-foreground">{parent.email}</p>
        <p className="text-sm">
          <span className="font-medium">Téléphone:</span> {parent.phone ?? '—'}
        </p>
        <p className="text-sm">
          <span className="font-medium">Enfants:</span> {parent.children_count}
        </p>

        <div className="flex flex-wrap gap-2 pt-3">
          <Button variant="outline" size="sm" className="rounded-xl bg-accent" render={<Link href={`/dashboard/admin/parents/${parent.id}`} />}>
            <Eye className="mr-1.5 size-4" />
            Voir
          </Button>
          {canWrite && (
            parent.is_active ? (
              <Button
                size="sm"
                className="rounded-xl bg-warning text-warning-foreground hover:brightness-95"
                onClick={(e) => { e.stopPropagation(); setConfirmToggle(true) }}
              >
                <UserX className="mr-1.5 size-4" />
                Désactiver
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="rounded-xl" onClick={(e) => { e.stopPropagation(); toggleMutation.mutate() }} disabled={toggleMutation.isPending}>
                {toggleMutation.isPending
                  ? <Loader2 className="mr-1.5 size-4 animate-spin" />
                  : <UserCheck className="mr-1.5 size-4" />}
                Réactiver
              </Button>
            )
          )}
        </div>
      </CardContent>
      </Card>

      <AlertDialog open={confirmToggle} onOpenChange={setConfirmToggle}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Désactiver ce compte ?</AlertDialogTitle>
            <AlertDialogDescription>
              {parent.nickname ?? `${parent.first_name} ${parent.last_name}`} ne pourra plus
              se connecter (réversible depuis sa fiche).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmToggle(false)
                toggleMutation.mutate()
              }}
            >
              Désactiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
