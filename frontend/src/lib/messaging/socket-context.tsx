'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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

const MAX_RECONNECT_DELAY_MS = 30000
const HEARTBEAT_INTERVAL_MS = 25000
const HEARTBEAT_TIMEOUT_MS = 10000
/** Fermeture demandée par le serveur (auth rejetée) : on ne reconnecte PAS,
 * sinon un token expiré/révoqué boucle à l'infini et martèle le backend. */
const AUTH_REJECT_CODE = 1008

export function MessagingSocketProvider({ children }: { children: ReactNode }) {
  const accessToken = useAccessToken()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<SocketStatus>('closed')
  const listenersRef = useRef<Set<Listener>>(new Set())
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const heartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptRef = useRef(0)
  const hadOpenedRef = useRef(false)

  useEffect(() => {
    if (!accessToken) {
      setStatus('closed')
      return
    }

    let cancelled = false

    const clearHeartbeat = () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current)
      if (heartbeatTimeoutRef.current) clearTimeout(heartbeatTimeoutRef.current)
      heartbeatTimerRef.current = null
      heartbeatTimeoutRef.current = null
    }

    const scheduleReconnect = () => {
      if (cancelled) return
      // Backoff exponentiel + jitter : 1s, 2s, 4s… plafonné à 30s.
      const delay = Math.min(
        1000 * 2 ** reconnectAttemptRef.current + Math.random() * 1000,
        MAX_RECONNECT_DELAY_MS,
      )
      reconnectAttemptRef.current += 1
      reconnectTimerRef.current = setTimeout(connect, delay)
    }

    const resync = () => {
      // Resync après reconnexion : tout message persisté pendant la coupure
      // (publish Redis best-effort) est rechargé — aucun trou permanent.
      queryClient.invalidateQueries({ queryKey: ['messaging'] })
      queryClient.invalidateQueries({ queryKey: ['parent', 'conversation'] })
      queryClient.invalidateQueries({ queryKey: ['parent', 'announcements'] })
    }

    const connect = () => {
      if (cancelled) return
      setStatus('connecting')
      const socket = new WebSocket(wsUrl(accessToken))
      socketRef.current = socket

      const startHeartbeat = () => {
        clearHeartbeat()
        heartbeatTimerRef.current = setInterval(() => {
          if (socket.readyState !== WebSocket.OPEN) return
          try {
            socket.send(JSON.stringify({ type: 'ping', t: Date.now() }))
          } catch {
            return
          }
          if (heartbeatTimeoutRef.current) clearTimeout(heartbeatTimeoutRef.current)
          heartbeatTimeoutRef.current = setTimeout(() => {
            // Pas de pong → connexion morte (NAT/proxy idle) : on force
            // la fermeture pour déclencher reconnect + resync.
            try { socket.close() } catch { /* déjà fermée */ }
          }, HEARTBEAT_TIMEOUT_MS)
        }, HEARTBEAT_INTERVAL_MS)
      }

      socket.onopen = () => {
        if (cancelled) return
        reconnectAttemptRef.current = 0
        setStatus('open')
        startHeartbeat()
        if (hadOpenedRef.current) resync()
        hadOpenedRef.current = true
      }

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as MessagingWSEvent | { type: 'pong' }
          if (data.type === 'pong') {
            if (heartbeatTimeoutRef.current) clearTimeout(heartbeatTimeoutRef.current)
            heartbeatTimeoutRef.current = null
            return
          }
          listenersRef.current.forEach((listener) => listener(data))
        } catch {
          // événement non-JSON — ignoré
        }
      }

      socket.onclose = (event) => {
        clearHeartbeat()
        if (cancelled) return
        setStatus('closed')
        if (event.code === AUTH_REJECT_CODE) return
        scheduleReconnect()
      }

      socket.onerror = () => socket.close()
    }

    const handleOnline = () => {
      if (socketRef.current?.readyState !== WebSocket.OPEN) {
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
        reconnectAttemptRef.current = 0
        connect()
      }
    }
    window.addEventListener('online', handleOnline)

    connect()

    return () => {
      cancelled = true
      window.removeEventListener('online', handleOnline)
      clearHeartbeat()
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [accessToken, queryClient])

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
