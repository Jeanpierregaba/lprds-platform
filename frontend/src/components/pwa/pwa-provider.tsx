'use client'

import { Download, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils/cn'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  'standalone' in window.navigator ||
  (window.navigator as { standalone?: boolean }).standalone === true

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState<boolean>(false)
  const [offline, setOffline] = useState<boolean>(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          updateViaCache: 'none',
        })
        await registration.update()
      } catch {
        // SW indisponible (HTTP hors localhost, navigateur non supporté) — non bloquant.
      }
    }

    const onOnline = () => setOffline(false)
    const onOffline = () => setOffline(true)
    const onInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
    }

    void register()
    if (isStandalone()) setInstalled(true)

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('beforeinstallprompt', onInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    setOffline(!navigator.onLine)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('beforeinstallprompt', onInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return
    setDeferredPrompt(null)
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setInstalled(true)
  }, [deferredPrompt])

  const showInstall = deferredPrompt !== null && !installed

  return (
    <div className="contents">
      {children}

      {showInstall && (
        <button
          type="button"
          onClick={promptInstall}
          className={cn(
            'fixed bottom-5 right-5 z-50 inline-flex h-12 items-center gap-2 rounded-full',
            'bg-primary px-5 text-sm font-medium text-primary-foreground',
            'shadow-[0_4px_0_#D88D16] hover:translate-y-0.5 hover:shadow-none',
            'transition-all motion-reduce:transition-none',
          )}
        >
          <Download className="size-4" aria-hidden="true" />
          Installer l&rsquo;application
        </button>
      )}

      {offline && (
        <div
          role="status"
          className={cn(
            'fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 py-2 text-sm',
            'border-b border-warning/40 bg-warning text-white',
          )}
        >
          <WifiOff className="size-4" aria-hidden="true" />
          Vous êtes hors ligne — les contenus mis en cache restent disponibles.
        </div>
      )}
    </div>
  )
}