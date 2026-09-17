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
    if (!user || !['message', 'message_deleted', 'read_receipt'].includes(event.type)) return
    // Les onglets de la page messagerie sont démontés hors de cette page :
    // on rafraîchit ici les compteurs de non-lus (pastille de navigation),
    // en réutilisant exactement leurs clés (aucune requête en double).
    if (user.role === 'admin') {
      queryClient.invalidateQueries({ queryKey: ['messaging', 'conversations'] })
    } else if (user.role === 'parent') {
      queryClient.invalidateQueries({ queryKey: ['parent', 'conversation-me'] })
    }
    // Mon propre message (envoyé depuis un autre onglet/appareil) — silence.
    if (event.type !== 'message' || event.sender.id === user.id) return

    const onMessagingPage =
      user.role === 'admin'
        ? pathname.startsWith('/dashboard/admin/messaging')
        : pathname.startsWith('/dashboard/parent/messaging')
    if (onMessagingPage) return

    const senderName =
      event.sender.nickname ||
      `${event.sender.first_name} ${event.sender.last_name ?? ''}`.trim() ||
      "L'établissement"
    const excerpt = event.body?.trim().slice(0, 120) || 'Nouvelle pièce jointe'
    toast.info(`Nouveau message — ${senderName}`, { description: excerpt })
  })

  return null
}
