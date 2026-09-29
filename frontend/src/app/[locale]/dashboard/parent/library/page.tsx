'use client'

import { useQuery } from '@tanstack/react-query'
import { intlLocale } from '@/lib/utils/locale-format'
import { useLabel } from '@/lib/i18n/labels'
import { BookMarked, BookOpen, LibraryBig } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs } from '@/components/ui/tabs'
import { libraryApi } from '@/lib/api/library.api'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { type LendingStatus } from '@/types/library'

const STATUS_BADGE_VARIANT: Record<LendingStatus, 'default' | 'outline' | 'destructive'> = {
  active: 'default',
  overdue: 'destructive',
  returned: 'outline',
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(intlLocale())
}

export default function ParentLibraryPage() {
  const lendingStatusLabel = useLabel('lendingStatus')
  const { data: books, isLoading: booksLoading } = useQuery({
    queryKey: ['library', 'mine', 'books'],
    queryFn: () => libraryApi.listMyBooks().then((r) => r.data),
  })

  const { data: lendings, isLoading: lendingsLoading } = useQuery({
    queryKey: ['library', 'mine', 'lendings'],
    queryFn: () => libraryApi.listMyLendings().then((r) => r.data),
  })

  const bookItems = books?.items ?? []
  const lendingItems = lendings?.items ?? []

  return (
    <PageMotion>
      <PageHeader
        title="Bibliothèque"
        description="Livres disponibles et emprunts de vos enfants."
      />

      <Tabs defaultValue="catalogue">
        <PillsTabsList>
          <PillsTrigger value="catalogue" active="primary" icon={BookOpen}>
            Catalogue
          </PillsTrigger>
          <PillsTrigger value="lendings" active="teal" icon={BookMarked}>
            Mes emprunts
          </PillsTrigger>
        </PillsTabsList>

        <TabPanel value="catalogue">
          {booksLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-36" />
              ))}
            </div>
          ) : bookItems.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <LibraryBig className="size-5" />
                </div>
                <p className="font-medium text-foreground">
                  Le catalogue est vide pour le moment.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {bookItems.map((book) => (
                <Card key={book.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="font-medium">{book.title}</div>
                    <div className="text-sm text-muted-foreground">{book.author}</div>
                    {book.description && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{book.description}</p>
                    )}
                    <div className="flex items-center justify-between gap-2 pt-1 text-sm">
                      <span className={book.available_quantity === 0 ? 'shrink-0 text-destructive' : 'shrink-0'}>
                        {book.available_quantity > 0
                          ? `${book.available_quantity} exemplaire${book.available_quantity > 1 ? 's' : ''} disponible${book.available_quantity > 1 ? 's' : ''}`
                          : 'Indisponible'}
                      </span>
                      {book.sections.length > 0 && (
                        <span className="min-w-0 text-right text-xs text-muted-foreground">
                          {book.sections.map((s) => s.name).join(', ')}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabPanel>

        <TabPanel value="lendings">
          {lendingsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : lendingItems.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <BookMarked className="size-5" />
                </div>
                <p className="font-medium text-foreground">
                  Votre enfant n'a aucun emprunt en cours.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="hidden sm:block">
                <Card>
                  <CardContent className="p-0">
                    <Table className="min-w-[640px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Livre</TableHead>
                          <TableHead>Enfant</TableHead>
                          <TableHead>Emprunté le</TableHead>
                          <TableHead>Retour prévu</TableHead>
                          <TableHead>Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                  <TableBody>
                    {lendingItems.map((lending) => (
                      <TableRow key={lending.id}>
                        <TableCell>
                          <div className="font-medium">{lending.book_title}</div>
                          <div className="text-xs text-muted-foreground">{lending.author}</div>
                        </TableCell>
                        <TableCell>{lending.child_name}</TableCell>
                        <TableCell>{formatDate(lending.borrowed_at)}</TableCell>
                        <TableCell>{formatDate(lending.due_date)}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE_VARIANT[lending.status]}>
                            {lendingStatusLabel(lending.status)}
                          </Badge>
                          {lending.overdue_days != null && (
                            <div className="mt-0.5 text-xs text-destructive">
                              {lending.overdue_days} j de retard
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
          <div className="space-y-3 sm:hidden">
            {lendingItems.map((lending) => (
              <Card key={lending.id}>
                <CardContent className="space-y-1.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{lending.book_title}</p>
                      <p className="truncate text-xs text-muted-foreground">{lending.author}</p>
                    </div>
                    <Badge variant={STATUS_BADGE_VARIANT[lending.status]} className="shrink-0">
                      {lendingStatusLabel(lending.status)}
                    </Badge>
                  </div>
                  {lending.overdue_days != null && (
                    <p className="text-xs text-destructive">{lending.overdue_days} j de retard</p>
                  )}
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="min-w-0 truncate">{lending.child_name}</span>
                    <span className="shrink-0">Emprunté le {formatDate(lending.borrowed_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Retour prévu le {formatDate(lending.due_date)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
            </>
          )}
        </TabPanel>
      </Tabs>
    </PageMotion>
  )
}