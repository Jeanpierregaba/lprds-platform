'use client'

import { usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useMessagingEvent } from '@/lib/messaging/socket-context'
import { useUser } from '@/lib/stores/auth.store'

/**
 * Notification à la réception d'un message privé (temps réel applicatif —
 * le push Web couvre l'app fermée, cf. backend `send_message`).
 *
 * Toast pour le destinataire (jamais pour ses propres messages, même venus
 * d'un autre onglet), sauf quand il est déjà sur sa page messagerie : le fil
 * se met à jour en direct et la pastille des non-lus couvre l'information.
 */
export function MessagingNotifier() {
  const user = useUser()
  const pathname = usePathname()
  const queryClient = useQueryClient()

  useMessagingEvent((event) => {
    if (!user) return
    if (event.type !== 'message' && event.type !== 'message_deleted' && event.type !== 'read_receipt') {
      return
    }
    const onMessagingPage =
      user.role === 'admin'
        ? pathname.startsWith('/dashboard/admin/messaging')
        : pathname.startsWith('/dashboard/parent/messaging')
    // Sur la page messagerie, les onglets gèrent déjà leurs invalidations :
    // on ne double pas le refetch ici.
    if (onMessagingPage) return
    // Hors page : on rafraîchit les compteurs de non-lus (pastille de
    // navigation), en réutilisant exactement les clés des onglets.
    if (user.role === 'admin') {
      queryClient.invalidateQueries({ queryKey: ['messaging', 'conversations'] })
    } else if (user.role === 'parent') {
      queryClient.invalidateQueries({ queryKey: ['parent', 'conversation-me'] })
    }
    // Garde de type explicite AVANT tout accès à `sender` : seuls les
    // événements `message` en portent un (un nouveau type sans `sender`
    // ajouté au filtre ci-dessus planterait sinon la distribution).
    if (event.type !== 'message') return
    // Mon propre message (envoyé depuis un autre onglet/appareil) — silence.
    if (event.sender.id === user.id) return

    const senderName =
      event.sender.nickname ||
      `${event.sender.first_name} ${event.sender.last_name ?? ''}`.trim() ||
      "L'établissement"
    const excerpt = event.body?.trim().slice(0, 120) || 'Nouvelle pièce jointe'
    // Dédupé par conversation : sous une rafale, un seul toast vivant,
    // mis à jour au lieu d'empiler N toasts.
    toast.info(`Nouveau message — ${senderName}`, {
      id: `new-message-${event.conversation_id}`,
      description: excerpt,
    })
  })

  return null
}
