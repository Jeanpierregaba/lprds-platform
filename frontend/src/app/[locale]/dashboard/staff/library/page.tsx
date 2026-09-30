'use client'

import { useTranslations } from 'next-intl'

import { useQuery } from '@tanstack/react-query'
import { BookOpen, LibraryBig } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { libraryApi } from '@/lib/api/library.api'
import { PageHeader, PageMotion } from '@/components/dashboard/shared/page'

export default function StaffLibraryPage() {
  const t = useTranslations('admin')
  const { data, isLoading } = useQuery({
    queryKey: ['library', 'educator', 'books'],
    queryFn: () => libraryApi.listEducatorBooks().then((r) => r.data),
  })

  const books = data?.items ?? []

  return (
    <PageMotion>
      <PageHeader
        title={t('portals.library')}
        description={t('portals.staffLibraryHint')}
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : books.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <LibraryBig className="size-5" />
            </div>
            <p className="font-medium text-foreground">{t('sectionCatalogueEmpty')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <Card key={book.id}>
              <CardContent className="space-y-2 p-4">
                <div className="font-medium">{book.title}</div>
                <div className="text-sm text-muted-foreground">{book.author}</div>
                <div className="flex items-center gap-2 pt-1 text-sm">
                  <BookOpen className="size-4 text-muted-foreground" />
                  <span className={book.available_quantity === 0 ? 'text-destructive' : undefined}>
                    {book.available_quantity}/{book.total_quantity} exemplaire
                    {book.available_quantity > 1 ? 's' : ''} disponible
                    {book.available_quantity > 1 ? 's' : ''}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageMotion>
  )
}