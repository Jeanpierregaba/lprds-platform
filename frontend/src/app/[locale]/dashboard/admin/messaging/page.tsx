'use client'

import { useTranslations } from 'next-intl'

import { Megaphone, MessagesSquare, Wifi, WifiOff } from 'lucide-react'
import { useSearchParams } from 'next/navigation'

import { Tabs } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { useMessagingSocketStatus } from '@/lib/messaging/socket-context'
import { PageMotion } from '@/components/dashboard/shared/page'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { AnnouncementsTab } from './announcements-tab'
import { ConversationsTab } from './conversations-tab'

function ConnectionBadge() {
  const t = useTranslations('messaging')
  const status = useMessagingSocketStatus()
  if (status === 'open') {
    return (
      <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
        <Wifi className="size-3" />
        {t('realtimeOn')}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
      <WifiOff className="size-3" />
      {status === 'connecting' ? t('status.connecting') : t('status.offline')}
    </Badge>
  )
}

export default function MessagingPage() {
  const t = useTranslations('messaging')
  /* Destination d'une notification push (`app/core/links.py`).
   *
   * ⚠️ Cet écran ouvre les DIFFUSIONS par défaut : sans ces paramètres, une
   * notification de message privé menait à l'onglet d'à côté, et l'admin — qui
   * a plusieurs conversations — devait retrouver la bonne dans la liste. */
  const params = useSearchParams()
  const tab = params.get('tab') === 'conversations' ? 'conversations' : 'announcements'
  const conversationId = params.get('conversation')

  return (
    <PageMotion>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('adminPage.title')}</h1>
          <p className="text-muted-foreground">{t('adminPage.description')}</p>
        </div>
        <ConnectionBadge />
      </div>

      <Tabs defaultValue={tab}>
        <PillsTabsList>
          <PillsTrigger value="announcements" active="primary" icon={Megaphone}>
            {t('tabs.announcements')}
          </PillsTrigger>
          <PillsTrigger value="conversations" active="teal" icon={MessagesSquare}>
            {t('tabs.conversations')}
          </PillsTrigger>
        </PillsTabsList>

        <TabPanel value="announcements">
          <AnnouncementsTab />
        </TabPanel>
        <TabPanel value="conversations">
          <ConversationsTab initialConversationId={conversationId} />
        </TabPanel>
      </Tabs>
    </PageMotion>
  )
}
