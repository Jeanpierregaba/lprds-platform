'use client'

import { useTranslations } from 'next-intl'

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

type T = (key: string) => string

const makeFormSchema = (t: T) => z.object({
  title: z.string().trim().min(1, t('book.titleRequired')).max(200, t('book.max200')),
  author: z.string().trim().min(1, t('book.authorRequired')).max(200, t('book.max200')),
  description: z.string().max(1000, t('book.max1000')).optional(),
  description_en: z.string().max(1000, t('book.max1000')).optional(),
  total_quantity: z
    .number({ error: t('book.number') })
    .int(t('book.integer'))
    .min(1, t('book.minCopy'))
    .max(1000, t('book.maxCopies')),
})

type FormValues = z.infer<ReturnType<typeof makeFormSchema>>

interface BookFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  book: Book | null
  sections: Section[]
}

export function BookFormDialog({ open, onOpenChange, book, sections }: BookFormDialogProps) {
  const t = useTranslations('library')
  const tCommon = useTranslations('common')
  const queryClient = useQueryClient()
  const [sectionIds, setSectionIds] = useState<string[]>([])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(makeFormSchema(t)) })

  useEffect(() => {
    if (open) {
      reset({
        title: book?.title ?? '',
        author: book?.author ?? '',
        description: book?.description ?? '',
        description_en: book?.description_en ?? '',
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
        // Vide = « régénère » : le backend retire la correction et repasse la
        // description à la machine (même contrat que la relecture des menus).
        description_en: values.description_en || '',
        total_quantity: values.total_quantity,
        section_ids: sectionIds,
      }
      return book
        ? libraryApi.updateBook(book.id, payload)
        : libraryApi.createBook(payload)
    },
    onSuccess: () => {
      toast.success(book ? t('book.updated') : t('book.created'))
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
          <DialogTitle>{book ? t('book.editTitle') : t('book.newTitle')}</DialogTitle>
          <DialogDescription>
            {book
              ? t('book.editHint')
              : t('book.newHint')}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="book-title">{t('book.title')}</Label>
              <Input id="book-title" placeholder={t('book.titlePlaceholder')} {...register('title')} />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="book-author">{t('book.author')}</Label>
              <Input id="book-author" placeholder={t('book.authorPlaceholder')} {...register('author')} />
              {errors.author && <p className="text-xs text-destructive">{errors.author.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="book-description">{t('book.description')}</Label>
            <Textarea
              id="book-description"
              placeholder={t('book.descriptionPlaceholder')}
              rows={3}
              {...register('description')}
            />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          {/* La description est le seul texte du module qu'un parent lit : elle
              est traduite automatiquement, et corrigeable ici à côté de sa
              source — jamais à sa place (l'admin écrirait alors dans le vide). */}
          <div className="space-y-1.5">
            <Label htmlFor="book-description-en">{t('book.descriptionEn')}</Label>
            <Textarea
              id="book-description-en"
              placeholder={t('book.descriptionEnPlaceholder')}
              rows={3}
              {...register('description_en')}
            />
            <p className="text-xs text-muted-foreground">{t('book.descriptionEnHint')}</p>
            {errors.description_en && <p className="text-xs text-destructive">{errors.description_en.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="book-quantity">{t('book.quantity')}</Label>
            <Input id="book-quantity" type="number" min={1} {...register('total_quantity', { valueAsNumber: true })} />
            {errors.total_quantity && <p className="text-xs text-destructive">{errors.total_quantity.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>{t('book.sections')}</Label>
            {sections.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noSectionHint')}</p>
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
              {tCommon('actions.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {book ? t('book.save') : t('book.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
