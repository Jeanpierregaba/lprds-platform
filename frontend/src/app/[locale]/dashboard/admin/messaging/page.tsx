'use client'

import { useTranslations } from 'next-intl'

import { Megaphone, MessagesSquare, Wifi, WifiOff } from 'lucide-react'

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
  return (
    <PageMotion>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('adminPage.title')}</h1>
          <p className="text-muted-foreground">{t('adminPage.description')}</p>
        </div>
        <ConnectionBadge />
      </div>

      <Tabs defaultValue="announcements">
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
          <ConversationsTab />
        </TabPanel>
      </Tabs>
    </PageMotion>
  )
}
