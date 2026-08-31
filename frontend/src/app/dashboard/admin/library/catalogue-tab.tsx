'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { libraryApi } from '@/lib/api/library.api'
import { organizationApi } from '@/lib/api/organization.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import type { Book } from '@/types/library'
import { BookFormDialog } from './book-form-dialog'

const PAGE_SIZE = 20
const ALL = '__all__'

export function CatalogueTab() {
  const [sectionId, setSectionId] = useState<string>(ALL)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [skip, setSkip] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBook, setEditingBook] = useState<Book | null>(null)
  const [deletingBook, setDeletingBook] = useState<Book | null>(null)

  useEffect(() => setSkip(0), [sectionId, includeInactive])

  const queryClient = useQueryClient()

  const { data: sections } = useQuery({
    queryKey: ['organization', 'sections'],
    queryFn: () => organizationApi.listSections({ include_inactive: true }).then((r) => r.data),
  })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['library-books', { sectionId, includeInactive, skip }],
    queryFn: () =>
      libraryApi
        .listBooks({
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

  const sectionItems = {
    [ALL]: 'Toutes les sections',
    ...Object.fromEntries((sections ?? []).map((s) => [s.id, s.name])),
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => libraryApi.deactivateBook(id),
    onSuccess: () => {
      toast.success('Livre désactivé du catalogue.')
      queryClient.invalidateQueries({ queryKey: ['library-books'] })
      setDeletingBook(null)
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <Select items={sectionItems} value={sectionId} onValueChange={(v) => setSectionId(v ?? ALL)}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Toutes les sections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Toutes les sections</SelectItem>
              {(sections ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Switch id="include-inactive-books" checked={includeInactive} onCheckedChange={setIncludeInactive} />
            <Label htmlFor="include-inactive-books" className="text-sm text-muted-foreground">
              Inclure les désactivés
            </Label>
          </div>
        </div>

        <Button
          onClick={() => {
            setEditingBook(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="mr-1.5 size-4" />
          Nouveau livre
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titre</TableHead>
                <TableHead>Auteur</TableHead>
                <TableHead>Sections</TableHead>
                <TableHead>Disponibilité</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <BookOpen className="size-5" />
                      </div>
                      <p className="font-medium text-foreground">Aucun livre dans le catalogue.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((book) => (
                  <TableRow key={book.id} className={!book.is_active ? 'opacity-50' : undefined}>
                    <TableCell className="font-medium">{book.title}</TableCell>
                    <TableCell className="text-muted-foreground">{book.author}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {book.sections.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          book.sections.map((s) => (
                            <Badge key={s.id} variant="outline">{s.name}</Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={book.available_quantity === 0 ? 'font-medium text-destructive' : undefined}>
                        {book.available_quantity}/{book.total_quantity}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={book.is_active ? 'default' : 'outline'}>
                        {book.is_active ? 'Actif' : 'Désactivé'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingBook(book)
                            setDialogOpen(true)
                          }}
                        >
                          <Pencil className="mr-1.5 size-4" />
                          Modifier
                        </Button>
                        {book.is_active && (
                          <Button variant="ghost" size="sm" onClick={() => setDeletingBook(book)}>
                            <Trash2 className="mr-1.5 size-4" />
                            Désactiver
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} livre{total > 1 ? 's' : ''}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!hasPrev || isFetching} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>
              Précédent
            </Button>
            <Button variant="outline" size="sm" disabled={!hasNext || isFetching} onClick={() => setSkip(skip + PAGE_SIZE)}>
              Suivant
            </Button>
          </div>
        </div>
      )}

      <BookFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        book={editingBook}
        sections={sections ?? []}
      />

      <AlertDialog
        open={deletingBook !== null}
        onOpenChange={(open) => !open && setDeletingBook(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Désactiver ce livre ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {deletingBook?.title} » ne sera plus empruntable, mais l'historique des prêts restera
              consultable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deletingBook && deleteMutation.mutate(deletingBook.id)}
            >
              Désactiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
