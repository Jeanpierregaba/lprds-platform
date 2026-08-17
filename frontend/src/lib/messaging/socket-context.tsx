'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAccessToken } from '@/lib/stores/auth.store'
import type { MessagingWSEvent } from '@/types/messaging'

type Listener = (event: MessagingWSEvent) => void
type SocketStatus = 'connecting' | 'open' | 'closed'

interface MessagingSocketContextValue {
  status: SocketStatus
  subscribe: (listener: Listener) => () => void
}

const MessagingSocketContext = createContext<MessagingSocketContextValue | null>(null)

function wsUrl(token: string) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? ''
  const base = apiUrl.replace(/^http/, 'ws')
  return `${base}/api/v1/messaging/ws?token=${encodeURIComponent(token)}`
}

const RECONNECT_DELAY_MS = 3000

export function MessagingSocketProvider({ children }: { children: ReactNode }) {
  const accessToken = useAccessToken()
  const [status, setStatus] = useState<SocketStatus>('closed')
  const listenersRef = useRef<Set<Listener>>(new Set())
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!accessToken) return

    let cancelled = false

    const connect = () => {
      if (cancelled) return
      setStatus('connecting')
      const socket = new WebSocket(wsUrl(accessToken))
      socketRef.current = socket

      socket.onopen = () => { if (!cancelled) setStatus('open') }

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as MessagingWSEvent
          listenersRef.current.forEach((listener) => listener(data))
        } catch {
          // événement non-JSON — ignoré
        }
      }

      socket.onclose = () => {
        if (cancelled) return
        setStatus('closed')
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS)
      }

      socket.onerror = () => socket.close()
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [accessToken])

  const subscribe = (listener: Listener) => {
    listenersRef.current.add(listener)
    return () => { listenersRef.current.delete(listener) }
  }

  return (
    <MessagingSocketContext.Provider value={{ status, subscribe }}>
      {children}
    </MessagingSocketContext.Provider>
  )
}

export function useMessagingEvent(handler: Listener) {
  const ctx = useContext(MessagingSocketContext)
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!ctx) return
    return ctx.subscribe((event) => handlerRef.current(event))
  }, [ctx])
}

export function useMessagingSocketStatus() {
  return useContext(MessagingSocketContext)?.status ?? 'closed'
}
