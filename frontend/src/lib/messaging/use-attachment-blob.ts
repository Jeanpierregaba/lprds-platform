'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { messagingApi } from '@/lib/api/messaging.api'

/** Blob téléchargé une seule fois (react-query, `staleTime: Infinity`) et
 * partagé entre tous les aperçus — grille, viewer, bulles.
 *
 * ⚠️ `thumb` fait partie de la CLÉ de cache, et ce n'est pas un détail : la
 * vignette et l'original sont deux fichiers différents. Les confondre ferait
 * enregistrer la vignette à la place de la photo, ou afficher l'original en
 * plein écran après l'avoir déjà payé en petit. */
export function useAttachmentBlob(id: string | null, { thumb = false } = {}) {
  const query = useQuery({
    queryKey: ['messaging', 'attachment-blob', id, thumb ? 'thumb' : 'full'],
    queryFn: () => messagingApi.downloadAttachment(id ?? '', thumb).then((r) => r.data),
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
