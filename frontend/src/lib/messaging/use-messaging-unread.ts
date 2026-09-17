'use client'

import { useQuery } from '@tanstack/react-query'

import { messagingApi } from '@/lib/api/messaging.api'
import { useUser } from '@/lib/stores/auth.store'

/**
 * Total des messages privés non lus pour la pastille « Messagerie » de la
 * navigation : somme des conversations côté admin, conversation unique côté
 * parent. Mêmes clés/fonctions que les onglets (cache react-query partagé —
 * aucune requête réseau supplémentaire quand l'onglet est déjà chargé).
 */
export function useMessagingUnread(): number {
  const user = useUser()
  const isAdmin = user?.role === 'admin'
  const isParent = user?.role === 'parent'

  const { data: conversations } = useQuery({
    queryKey: ['messaging', 'conversations'],
    queryFn: () => messagingApi.listConversations({ limit: 100 }).then((r) => r.data),
    enabled: isAdmin,
  })

  const { data: ownConversation } = useQuery({
    queryKey: ['parent', 'conversation-me'],
    queryFn: () => messagingApi.getMyConversation().then((r) => r.data),
    enabled: isParent,
  })

  if (isAdmin) {
    return (conversations?.items ?? []).reduce((sum, c) => sum + (c.unread_count ?? 0), 0)
  }
  if (isParent) {
    return ownConversation?.unread_count ?? 0
  }
  return 0
}
