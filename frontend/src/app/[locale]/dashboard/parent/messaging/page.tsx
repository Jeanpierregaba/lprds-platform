'use client'

import { useTranslations } from 'next-intl'

import { Megaphone, MessagesSquare, Wifi, WifiOff } from 'lucide-react'

import { Tabs } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { useMessagingSocketStatus } from '@/lib/messaging/socket-context'
import { PageMotion } from '@/components/dashboard/shared/page'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { AnnouncementsTab } from './announcements-tab'
import { ConversationTab } from './conversation-tab'
import { useSearchParams } from 'next/navigation'

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

export default function ParentMessagingPage() {
  /* Destination d'une notification push : cet écran ouvre les DIFFUSIONS par
   * défaut, donc une notification de message privé menait à l'onglet d'à côté
   * (cf. `app/core/links.py`). */
  const params = useSearchParams()
  const tab = params.get('tab') === 'conversation' ? 'conversation' : 'announcements'
  /* `announcement` désigne LAQUELLE : le bouton d'un email de diffusion mène
   * ici, et la liste peut en compter des dizaines. */
  const focusId = params.get('announcement')
  const t = useTranslations('messaging')
  return (
    <PageMotion>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{t('parentPage.title')}</h1>
          <p className="text-muted-foreground">{t('parentPage.description')}</p>
        </div>
        <ConnectionBadge />
      </div>

      <Tabs defaultValue={tab}>
        <PillsTabsList>
          <PillsTrigger value="announcements" active="primary" icon={Megaphone}>
            {t('tabs.announcements')}
          </PillsTrigger>
          <PillsTrigger value="conversation" active="teal" icon={MessagesSquare}>
            {t('tabs.conversation')}
          </PillsTrigger>
        </PillsTabsList>

        <TabPanel value="announcements">
          <AnnouncementsTab focusId={focusId} />
        </TabPanel>
        <TabPanel value="conversation">
          <ConversationTab />
        </TabPanel>
      </Tabs>
    </PageMotion>
  )
}
