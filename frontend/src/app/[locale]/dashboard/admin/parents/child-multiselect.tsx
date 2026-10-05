'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { childrenApi } from '@/lib/api/children.api'
import type { ParentChildBrief } from '@/types/parents'

export function ChildMultiSelect({
  selected, onChange,
}: { selected: ParentChildBrief[]; onChange: (children: ParentChildBrief[]) => void }) {
  const t = useTranslations('parents')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading } = useQuery({
    queryKey: ['children', { search: debouncedSearch }],
    queryFn: () => childrenApi.list({ search: debouncedSearch || undefined, limit: 10 }).then((r) => r.data),
    enabled: debouncedSearch.length > 0,
  })

  const selectedIds = new Set(selected.map((c) => c.id))
  const results = (data?.items ?? []).filter((c) => !selectedIds.has(c.id))

  const add = (child: ParentChildBrief) => {
    onChange([...selected, child])
    setSearch('')
    setDebouncedSearch('')
  }

  const remove = (id: string) => onChange(selected.filter((c) => c.id !== id))

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((c) => (
            <Badge key={c.id} variant="secondary" className="gap-1 pr-1">
              {c.first_names} {c.last_name}
              <button
                type="button"
                onClick={() => remove(c.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
                aria-label={t('multiselect.remove', { name: `${c.first_names} ${c.last_name}` })}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('multiselect.search')}
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {debouncedSearch && (
        <div className="divide-y divide-border rounded-md border border-border">
          {isLoading ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : results.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">{t('form.noResult')}</p>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => add({ id: c.id, matricule: c.matricule, last_name: c.last_name, first_names: c.first_names, has_photo: c.has_photo })}
                className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm hover:bg-muted"
              >
                <span className="font-medium">{c.first_names} {c.last_name}</span>
                <span className="font-mono text-xs text-muted-foreground">{c.matricule}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
