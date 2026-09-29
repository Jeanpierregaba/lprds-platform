'use client'

import { useEffect, useState } from 'react'
import { useLabel, useLabelMap } from '@/lib/i18n/labels'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeftRight, BookMarked, Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableBody, TableRow } from '@/components/ui/table'
import { childrenApi } from '@/lib/api/children.api'
import { libraryApi } from '@/lib/api/library.api'
import { useMyPermissions } from '@/lib/hooks/use-my-permissions'
import { useUser } from '@/lib/stores/auth.store'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { cn } from '@/lib/utils/cn'
import { DataTable, DataTableHead, TableSkeletonRows, Td, Th } from '@/components/dashboard/shared/table'
import { LENDING_STATUSES, type LendingStatus } from '@/types/library'

const PAGE_SIZE = 20
const ALL = '__all__'

const STATUS_PILLS: Record<LendingStatus, string> = {
  active: 'bg-sky text-white',
  overdue: 'bg-destructive text-white',
  returned: 'bg-muted text-muted-foreground',
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR')
}

const lendingFormSchema = z.object({
  book_id: z.string().min(1, 'Sélectionnez un livre'),
  child_id: z.string().min(1, 'Sélectionnez un enfant'),
  borrowed_at: z.string().optional(),
  due_date: z.string().optional(),
})

type LendingFormValues = z.infer<typeof lendingFormSchema>

function CreateLendingDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()

  const { data: books } = useQuery({
    queryKey: ['library-books', 'available'],
    queryFn: () => libraryApi.listBooks({ include_inactive: false, limit: 100 }).then((r) => r.data),
    enabled: open,
  })

  const { data: children } = useQuery({
    queryKey: ['children', 'for-lending'],
    queryFn: () => childrenApi.list({ limit: 100 }).then((r) => r.data),
    enabled: open,
  })

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LendingFormValues>({
    resolver: zodResolver(lendingFormSchema),
    defaultValues: { book_id: '', child_id: '', borrowed_at: '', due_date: '' },
  })

  useEffect(() => {
    if (open) reset({ book_id: '', child_id: '', borrowed_at: '', due_date: '' })
  }, [open, reset])

  const bookId = watch('book_id')
  const childId = watch('child_id')

  const availableBooks = (books?.items ?? []).filter((b) => b.available_quantity > 0)
  const childrenItems = children?.items ?? []

  const bookItems = Object.fromEntries(
    availableBooks.map((b) => [b.id, `${b.title} — ${b.author} (${b.available_quantity} dispo)`])
  )
  const childItems = Object.fromEntries(
    childrenItems.map((c) => [c.id, `${c.first_names} ${c.last_name} (${c.matricule})`])
  )

  const mutation = useMutation({
    mutationFn: (values: LendingFormValues) =>
      libraryApi.createLending({
        book_id: values.book_id,
        child_id: values.child_id,
        borrowed_at: values.borrowed_at || undefined,
        due_date: values.due_date || undefined,
      }),
    onSuccess: () => {
      toast.success('Prêt enregistré.')
      queryClient.invalidateQueries({ queryKey: ['library-lendings'] })
      queryClient.invalidateQueries({ queryKey: ['library-books'] })
      onOpenChange(false)
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau prêt</DialogTitle>
          <DialogDescription>
            La date de retour est planifiée selon les paramètres de la bibliothèque (par défaut 14 jours).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lending-book">Livre</Label>
            <Select items={bookItems} value={bookId} onValueChange={(v) => setValue('book_id', v ?? '')}>
              <SelectTrigger id="lending-book" className="w-full">
                <SelectValue placeholder="Choisir un livre…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Choisir un livre…</SelectItem>
                {Object.entries(bookItems).map(([id, label]) => (
                  <SelectItem key={id} value={id}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.book_id && <p className="text-xs text-destructive">{errors.book_id.message}</p>}
            {availableBooks.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Aucun livre disponible à la location pour le moment.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lending-child">Enfant</Label>
            <Select items={childItems} value={childId} onValueChange={(v) => setValue('child_id', v ?? '')}>
              <SelectTrigger id="lending-child" className="w-full">
                <SelectValue placeholder="Choisir un enfant…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Choisir un enfant…</SelectItem>
                {Object.entries(childItems).map(([id, label]) => (
                  <SelectItem key={id} value={id}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.child_id && <p className="text-xs text-destructive">{errors.child_id.message}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lending-borrowed">Emprunté le</Label>
              <Input id="lending-borrowed" type="date" {...register('borrowed_at')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lending-due">Retour prévu</Label>
              <Input id="lending-due" type="date" {...register('due_date')} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Enregistrer le prêt
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function LendingsTab() {
  const lendingStatusLabel = useLabel('lendingStatus')
  const lendingStatusLabels = useLabelMap('lendingStatus', LENDING_STATUSES)
  const user = useUser()
  const { permissions } = useMyPermissions()
  const canLend = user?.role === 'admin' || permissions.has('library:lend')
  const [statusFilter, setStatusFilter] = useState<string>(ALL)
  const [skip, setSkip] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => setSkip(0), [statusFilter])

  const queryClient = useQueryClient()

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['library-lendings', { statusFilter, skip }],
    queryFn: () =>
      libraryApi
        .listLendings({
          status_filter: statusFilter === ALL ? undefined : statusFilter,
          skip,
          limit: PAGE_SIZE,
        })
        .then((r) => r.data),
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []
  const hasNext = skip + PAGE_SIZE < total
  const hasPrev = skip > 0

  const returnMutation = useMutation({
    mutationFn: (id: string) => libraryApi.returnLending(id),
    onSuccess: () => {
      toast.success('Livre rendu.')
      queryClient.invalidateQueries({ queryKey: ['library-lendings'] })
      queryClient.invalidateQueries({ queryKey: ['library-books'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          items={{ [ALL]: 'Tous les statuts', ...lendingStatusLabels }}
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v ?? ALL)}
        >
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les statuts</SelectItem>
            {Object.entries(lendingStatusLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

{canLend && (
        <Button onClick={() => setDialogOpen(true)}>
          <ArrowLeftRight className="mr-1.5 size-4" />
          Nouveau prêt
        </Button>
        )}
      </div>

      <DataTable>
        <DataTableHead>
          <Th>Livre</Th>
          <Th>Enfant</Th>
          <Th>Emprunté le</Th>
          <Th>Retour prévu</Th>
          <Th>Statut</Th>
          <Th />
        </DataTableHead>
        <TableBody>
          {isLoading ? (
            <TableSkeletonRows
              widths={['h-4 w-48', 'h-4 w-36', 'h-4 w-24', 'h-4 w-24', 'h-5 w-20 rounded-full', '']}
            />
          ) : items.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <Td colSpan={6} className="h-48 text-center">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                    <BookMarked className="size-5" />
                  </div>
                  <p className="font-medium text-foreground">Aucun prêt enregistré.</p>
                </div>
              </Td>
            </TableRow>
          ) : (
            items.map((lending) => (
              <TableRow key={lending.id}>
                <Td>
                  <div className="font-medium">{lending.book_title}</div>
                  <div className="text-xs text-muted-foreground">{lending.author}</div>
                </Td>
                <Td>
                  <div className="font-medium">{lending.child_name}</div>
                  <div className="text-xs text-muted-foreground">{lending.child_matricule}</div>
                </Td>
                <Td className="text-muted-foreground">{formatDate(lending.borrowed_at)}</Td>
                <Td className="text-muted-foreground">{formatDate(lending.due_date)}</Td>
                <Td>
                  <span className={cn('inline-block rounded-full px-3 py-1 text-xs font-semibold', STATUS_PILLS[lending.status])}>
                    {lendingStatusLabel(lending.status)}
                  </span>
                  {lending.overdue_days != null && (
                    <div className="mt-0.5 text-xs text-destructive">
                      {lending.overdue_days} j de retard
                    </div>
                  )}
                </Td>
                <Td>
                  {lending.status !== 'returned' && canLend && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={returnMutation.isPending}
                      onClick={() => returnMutation.mutate(lending.id)}
                    >
                      <RotateCcw className="mr-1.5 size-4" />
                      Rendre
                    </Button>
                  )}
                </Td>
              </TableRow>
            ))
          )}
        </TableBody>
      </DataTable>

      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} prêt{total > 1 ? 's' : ''}</span>
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

      <CreateLendingDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
