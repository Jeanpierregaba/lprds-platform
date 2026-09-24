'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { messagingApi } from '@/lib/api/messaging.api'

/** Blob téléchargé une seule fois (react-query, `staleTime: Infinity`) et
 * partagé entre tous les aperçus — grille, viewer, bulles. */
export function useAttachmentBlob(id: string | null) {
  const query = useQuery({
    queryKey: ['messaging', 'attachment-blob', id],
    queryFn: () => messagingApi.downloadAttachment(id ?? '').then((r) => r.data),
    enabled: id !== null,
    staleTime: Infinity,
    retry: 1,
  })
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!query.data) return
    const objectUrl = URL.createObjectURL(query.data)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [query.data])

  return { blob: query.data ?? null, url, isLoading: query.isLoading, isError: query.isError }
}
