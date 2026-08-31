'use client'

import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { BookMarked, BookOpen, LibraryBig } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { libraryApi } from '@/lib/api/library.api'
import { LENDING_STATUS_LABELS, type LendingStatus } from '@/types/library'

const STATUS_BADGE_VARIANT: Record<LendingStatus, 'default' | 'outline' | 'destructive'> = {
  active: 'default',
  overdue: 'destructive',
  returned: 'outline',
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR')
}

export default function ParentLibraryPage() {
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
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div>
        <h1 className="text-2xl font-bold">Bibliothèque</h1>
        <p className="text-muted-foreground">
          Livres disponibles et emprunts de vos enfants.
        </p>
      </div>

      <Tabs defaultValue="catalogue">
        <TabsList>
          <TabsTrigger value="catalogue">
            <BookOpen className="mr-1.5 size-4" />
            Catalogue
          </TabsTrigger>
          <TabsTrigger value="lendings">
            <BookMarked className="mr-1.5 size-4" />
            Mes emprunts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalogue" className="pt-2">
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
                    <div className="flex items-center justify-between pt-1 text-sm">
                      <span className={book.available_quantity === 0 ? 'text-destructive' : undefined}>
                        {book.available_quantity > 0
                          ? `${book.available_quantity} exemplaire${book.available_quantity > 1 ? 's' : ''} disponible${book.available_quantity > 1 ? 's' : ''}`
                          : 'Indisponible'}
                      </span>
                      {book.sections.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {book.sections.map((s) => s.name).join(', ')}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="lendings" className="pt-2">
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
            <Card>
              <CardContent className="p-0">
                <Table>
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
                            {LENDING_STATUS_LABELS[lending.status]}
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
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}