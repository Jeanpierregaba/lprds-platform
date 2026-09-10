'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Search, UserRound } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { staffApi } from '@/lib/api/staff.api'
import { STAFF_TYPE_LABELS, type StaffType } from '@/types/staff'

const PAGE_SIZE = 20
const ALL = '__all__'

export default function StaffListPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [staffType, setStaffType] = useState<string>(ALL)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [skip, setSkip] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => setSkip(0), [debouncedSearch, staffType, includeInactive])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['staff', { search: debouncedSearch, staffType, includeInactive, skip }],
    queryFn: () =>
      staffApi
        .list({
          search: debouncedSearch || undefined,
          staff_type: staffType === ALL ? undefined : (staffType as StaffType),
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
          <h1 className="text-2xl font-bold">Personnel</h1>
          <p className="text-muted-foreground">Gérer les comptes de votre personnel.</p>
        </div>
        <Button render={<Link href="/dashboard/admin/staff/new" />}>
          <Plus className="mr-1.5 size-4" />
          Nouveau membre
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, surnom, email ou matricule..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          items={{ [ALL]: 'Tous les types', ...STAFF_TYPE_LABELS }}
          value={staffType}
          onValueChange={(v) => setStaffType(v ?? ALL)}
        >
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Tous les types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les types</SelectItem>
            {Object.entries(STAFF_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="include-inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} />
          <Label htmlFor="include-inactive" className="text-sm text-white font-semibold">Inclure les comptes inactifs</Label>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Matricule</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="h-56 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <UserRound className="size-5" />
                      </div>
                      <p className="font-medium text-foreground">
                        {debouncedSearch ? 'Aucun résultat pour cette recherche.' : 'Aucun membre du personnel pour le moment.'}
                      </p>
                      <p className="max-w-sm text-sm">
                        {debouncedSearch
                          ? 'Essayez un autre nom, surnom, email ou matricule.'
                          : 'Créez le premier compte pour commencer à gérer votre personnel.'}
                      </p>
                      {!debouncedSearch && (
                        <Button render={<Link href="/dashboard/admin/staff/new" />} size="sm" className="mt-1">
                          <Plus className="mr-1.5 size-4" />
                          Nouveau membre
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/admin/staff/${s.id}`} className="block p-2 font-mono text-xs">
                        {s.matricule ?? '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/admin/staff/${s.id}`} className="block p-2 font-medium">
                        {s.nickname ?? `${s.first_name} ${s.last_name}`}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/admin/staff/${s.id}`} className="block p-2 text-muted-foreground">
                        {s.staff_type ? STAFF_TYPE_LABELS[s.staff_type] : '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/admin/staff/${s.id}`} className="block p-2 text-muted-foreground">
                        {s.email}
                      </Link>
                    </TableCell>
                    <TableCell className="p-0">
                      <Link href={`/dashboard/admin/staff/${s.id}`} className="block p-2">
                        <Badge variant={s.is_active ? 'secondary' : 'outline'}>
                          {s.is_active ? 'Actif' : 'Inactif'}
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

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} membre{total > 1 ? 's' : ''} {isFetching && !isLoading && '· actualisation...'}
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
