'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { libraryApi } from '@/lib/api/library.api'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { organizationApi } from '@/lib/api/organization.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { cn } from '@/lib/utils/cn'
import { InactiveSwitch } from '@/components/dashboard/shared/filters'
import { CardsEmptyState, CardsGrid, CardsSkeleton, StaggerItem, StatusPill } from '@/components/dashboard/shared/cards'
import { ConfirmDialog } from '@/components/dashboard/shared/dialogs'
import type { Book } from '@/types/library'
import { BookFormDialog } from './book-form-dialog'

const PAGE_SIZE = 20
const ALL = '__all__'

export function CatalogueTab() {
  const t = useTranslations('library')
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canWrite = user?.role === 'admin' || permissions.has('library:write')
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
    [ALL]: t('catalogue.allSections'),
    ...Object.fromEntries((sections ?? []).map((s) => [s.id, s.name])),
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => libraryApi.deactivateBook(id),
    onSuccess: () => {
      toast.success(t('catalogue.deactivated'))
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
              <SelectValue placeholder={t('catalogue.allSections')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('catalogue.allSections')}</SelectItem>
              {(sections ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <InactiveSwitch
            id="include-inactive-books"
            checked={includeInactive}
            onCheckedChange={setIncludeInactive}
            label={t('catalogue.includeInactive')}
          />
        </div>

{canWrite && (
        <Button
          onClick={() => {
            setEditingBook(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="mr-1.5 size-4" />
          {t('catalogue.new')}
        </Button>
        )}
      </div>

      <BooksCardGrid
        items={items}
        isLoading={isLoading}
        canWrite={canWrite}
        onEdit={(book) => { setEditingBook(book); setDialogOpen(true) }}
        onDeactivate={setDeletingBook}
      />

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

      <ConfirmDialog
        open={deletingBook !== null}
        onOpenChange={(open) => !open && setDeletingBook(null)}
        title={t('catalogue.deactivateTitle')}
        description={t('catalogue.deactivateBody', { title: deletingBook?.title ?? '' })}
        confirmLabel={t('catalogue.deactivate')}
        destructive
        onConfirm={() => deletingBook && deleteMutation.mutate(deletingBook.id)}
      />
    </div>
  )
}

function BooksCardGrid({
  items, isLoading, canWrite, onEdit, onDeactivate,
}: {
  items: Book[]
  isLoading: boolean
  canWrite: boolean
  onEdit: (book: Book) => void
  onDeactivate: (book: Book) => void
}) {
  const t = useTranslations('library')
  if (isLoading) {
    return <CardsSkeleton />
  }

  if (items.length === 0) {
    return (
      <CardsEmptyState
        icon={BookOpen}
        title={t('catalogue.empty')}
        heightClass="h-48"
      />
    )
  }

  return (
    <CardsGrid>
      {items.map((book, i) => (
        <StaggerItem key={book.id} index={i}>
          <Card className={cn('rounded-2xl shadow-soft transition hover:-translate-y-0.5', !book.is_active && 'opacity-75')}>
            <CardContent className="space-y-1.5 p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 break-words font-display text-xl font-semibold leading-tight">{book.title}</p>
                <StatusPill active={book.is_active} activeLabel="Actif" inactiveLabel="Désactivé" shrink />
              </div>
              <p className="text-sm text-muted-foreground">par {book.author}</p>
              <div className="flex flex-wrap gap-1">
                {book.sections.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Aucune section</span>
                ) : (
                  book.sections.map((s) => (
                    <span key={s.id} className="inline-block rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                      {s.name}
                    </span>
                  ))
                )}
              </div>
              <p className="text-sm">
                <span className="font-medium">{t('catalogue.available')}</span>{' '}
                <span className={book.available_quantity === 0 ? 'font-semibold text-destructive' : undefined}>
                  {book.available_quantity}/{book.total_quantity}
                </span>
              </p>
              {canWrite && (
                <div className="flex flex-wrap gap-2 pt-3">
                  <Button variant="outline" size="sm" className="rounded-xl bg-accent" onClick={() => onEdit(book)}>
                    <Pencil className="mr-1.5 size-4" />
                    {t('catalogue.edit')}
                  </Button>
                  {book.is_active && (
                    <Button variant="ghost" size="sm" onClick={() => onDeactivate(book)}>
                      <Trash2 className="mr-1.5 size-4" />
                      Désactiver
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </StaggerItem>
      ))}
    </CardsGrid>
  )
}
