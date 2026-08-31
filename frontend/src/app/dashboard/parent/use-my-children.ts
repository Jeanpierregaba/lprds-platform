'use client'

import { useQuery } from '@tanstack/react-query'
import { parentsApi } from '@/lib/api/parents.api'

export function useMyChildren() {
  const { data, isLoading } = useQuery({
    queryKey: ['parent', 'my-children'],
    queryFn: () => parentsApi.listMyChildren().then((r) => r.data),
  })

  return { children: data ?? [], isLoading }
}
