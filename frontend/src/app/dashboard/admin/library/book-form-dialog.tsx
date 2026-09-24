'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Textarea } from '@/components/ui/textarea'
import { libraryApi } from '@/lib/api/library.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import type { Book } from '@/types/library'
import type { Section } from '@/types/organization'

const formSchema = z.object({
  title: z.string().trim().min(1, 'Titre requis').max(200, '200 caractères max'),
  author: z.string().trim().min(1, 'Auteur requis').max(200, '200 caractères max'),
  description: z.string().max(1000, '1000 caractères max').optional(),
  total_quantity: z
    .number({ error: 'Saisissez un nombre' })
    .int('Nombre entier')
    .min(1, 'Au moins 1 exemplaire')
    .max(1000, '1000 exemplaires max'),
})

type FormValues = z.infer<typeof formSchema>

interface BookFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  book: Book | null
  sections: Section[]
}

export function BookFormDialog({ open, onOpenChange, book, sections }: BookFormDialogProps) {
  const queryClient = useQueryClient()
  const [sectionIds, setSectionIds] = useState<string[]>([])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) })

  useEffect(() => {
    if (open) {
      reset({
        title: book?.title ?? '',
        author: book?.author ?? '',
        description: book?.description ?? '',
        total_quantity: book?.total_quantity ?? 1,
      })
      setSectionIds(book?.sections.map((s) => s.id) ?? [])
    }
  }, [open, book, reset])

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        title: values.title,
        author: values.author,
        description: values.description || '',
        total_quantity: values.total_quantity,
        section_ids: sectionIds,
      }
      return book
        ? libraryApi.updateBook(book.id, payload)
        : libraryApi.createBook(payload)
    },
    onSuccess: () => {
      toast.success(book ? 'Livre modifié.' : 'Livre ajouté au catalogue.')
      queryClient.invalidateQueries({ queryKey: ['library-books'] })
      onOpenChange(false)
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  })

  function toggleSection(id: string) {
    setSectionIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{book ? 'Modifier le livre' : 'Nouveau livre'}</DialogTitle>
          <DialogDescription>
            {book
              ? 'Modifiez les informations du livre. La quantité disponible se met à jour automatiquement.'
              : 'Ajoutez un livre au catalogue et choisissez les sections où il sera empruntable.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="book-title">Titre</Label>
              <Input id="book-title" placeholder="Le Petit Prince" {...register('title')} />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="book-author">Auteur</Label>
              <Input id="book-author" placeholder="Antoine de Saint-Exupéry" {...register('author')} />
              {errors.author && <p className="text-xs text-destructive">{errors.author.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="book-description">Description</Label>
            <Textarea
              id="book-description"
              placeholder="Quelques mots sur le livre…"
              rows={3}
              {...register('description')}
            />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="book-quantity">Nombre d'exemplaires</Label>
            <Input id="book-quantity" type="number" min={1} {...register('total_quantity', { valueAsNumber: true })} />
            {errors.total_quantity && <p className="text-xs text-destructive">{errors.total_quantity.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Sections concernées</Label>
            {sections.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune section configurée. Créez d'abord des sections dans le module Organisation.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {sections.map((section) => (
                  <label
                    key={section.id}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={sectionIds.includes(section.id)}
                      onCheckedChange={() => toggleSection(section.id)}
                    />
                    {section.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {book ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
