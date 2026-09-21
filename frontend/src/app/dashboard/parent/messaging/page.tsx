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
          <TabsList className="h-auto w-full gap-1.5 overflow-x-auto rounded-2xl bg-card p-1.5 shadow-soft ring-1 ring-border sm:w-fit">
            <TabsTrigger
              value="announcements"
              className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:bg-primary data-active:text-white data-active:shadow-md"
            >
              <Megaphone className="mr-1.5 size-4" />
              Diffusions
            </TabsTrigger>
            <TabsTrigger
              value="conversation"
              className="rounded-xl px-4 py-2.5 text-muted-foreground transition-all duration-300 ease-in-out hover:bg-accent hover:text-foreground data-active:bg-teal data-active:text-white data-active:shadow-md"
            >
              <MessagesSquare className="mr-1.5 size-4" />
              Conversation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="announcements">
            <motion.div
              key="parent-announcements"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <AnnouncementsTab />
            </motion.div>
          </TabsContent>
          <TabsContent value="conversation">
            <motion.div
              key="parent-conversation"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <ConversationTab />
            </motion.div>
          </TabsContent>
        </Tabs>
      </motion.div>
  )
}
