'use client'

import { motion } from 'framer-motion'
import { Megaphone, MessagesSquare, Wifi, WifiOff } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { useMessagingSocketStatus } from '@/lib/messaging/socket-context'
import { AnnouncementsTab } from './announcements-tab'
import { ConversationTab } from './conversation-tab'

function ConnectionBadge() {
  const status = useMessagingSocketStatus()
  if (status === 'open') {
    return (
      <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
        <Wifi className="size-3" />
        Temps réel actif
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
      <WifiOff className="size-3" />
      {status === 'connecting' ? 'Connexion...' : 'Hors ligne'}
    </Badge>
  )
}

export default function ParentMessagingPage() {
  return (
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="space-y-4"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Messagerie</h1>
            <p className="text-muted-foreground">Diffusions de l&apos;établissement et conversation privée.</p>
          </div>
          <ConnectionBadge />
        </div>

        <Tabs defaultValue="announcements">
          <TabsList>
            <TabsTrigger value="announcements">
              <Megaphone className="mr-1.5 size-4" />
              Diffusions
            </TabsTrigger>
            <TabsTrigger value="conversation">
              <MessagesSquare className="mr-1.5 size-4" />
              Conversation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="announcements">
            <AnnouncementsTab />
          </TabsContent>
          <TabsContent value="conversation">
            <ConversationTab />
          </TabsContent>
        </Tabs>
      </motion.div>
  )
}
