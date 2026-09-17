'use client'

import { Download, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils/cn'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  'standalone' in window.navigator ||
  (window.navigator as { standalone?: boolean }).standalone === true

// Version compilée dans le bundle au build (NEXT_PUBLIC_APP_VERSION, cf.
// scripts/stamp-version.mjs). Absente en dev local → auto-update désactivé.
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || ''
// Fréquence du sondage de version quand l'onglet reste ouvert.
const UPDATE_POLL_MS = 15 * 60 * 1000
const UPDATED_FLAG = 'lprds-sw-updated'

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState<boolean>(false)
  const [offline, setOffline] = useState<boolean>(false)
  // Garde anti double-rechargement (controllerchange + sondage version).
  const reloadingRef = useRef(false)

  const applyUpdate = useCallback((reason: string) => {
    if (reloadingRef.current) return
    reloadingRef.current = true
    try {
      sessionStorage.setItem(UPDATED_FLAG, '1')
    } catch {
      // Stockage indisponible (navigation privée) — on recharge quand même.
    }
    toast.info(`Nouvelle version disponible (${reason}) — actualisation…`)
    // Court délai pour laisser le toast s'afficher avant le rechargement.
    window.setTimeout(() => window.location.reload(), 1500)
  }, [])

  useEffect(() => {
    // Toast de confirmation après un rechargement provoqué par une mise à jour.
    try {
      if (sessionStorage.getItem(UPDATED_FLAG)) {
        sessionStorage.removeItem(UPDATED_FLAG)
        toast.success('Application mise à jour.')
      }
    } catch {
      // Stockage indisponible — on ignore.
    }

    if (!('serviceWorker' in navigator)) return

    let registration: ServiceWorkerRegistration | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null

    // Compare la version déployée (/version.json, jamais caché) à celle du
    // bundle courant : différence = nouveau déploiement → rechargement auto.
    const checkForUpdate = async () => {
      if (!APP_VERSION || reloadingRef.current || !navigator.onLine) return
      try {
        const res = await fetch('/version.json', { cache: 'no-store' })
        if (!res.ok) return
        const { version } = (await res.json()) as { version?: string }
        if (version && version !== APP_VERSION) {
          applyUpdate('mise à jour détectée')
          return
        }
      } catch {
        // Hors ligne ou sonde indisponible — on réessaiera au prochain cycle.
      }
      // Le worker lui-même a peut-être changé (bump CACHE_VERSION) : le
      // navigateur le découvre ici, l'active aussitôt (skipWaiting côté SW),
      // et `controllerchange` ci-dessous recharge la page.
      try {
        await registration?.update()
      } catch {
        // Non bloquant.
      }
    }

    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register('/sw.js', {
          updateViaCache: 'none',
        })
        await registration.update()
      } catch {
        // SW indisponible (HTTP hors localhost, navigateur non supporté) — non bloquant.
      }
    }

    // La page était-elle déjà pilotée par un worker au chargement ? Non au
    // tout premier chargement (installation initiale) : dans ce cas le
    // `controllerchange` qui suit le claim() ne doit PAS recharger la page.
    const hadController = navigator.serviceWorker.controller !== null
    // Nouveau worker aux commandes (skipWaiting + claim côté SW) : la page
    // tourne encore sur l'ancien code → rechargement auto, sans geste manuel.
    const onControllerChange = () => {
      if (hadController) applyUpdate('service worker renouvelé')
    }

    const onOnline = () => {
      setOffline(false)
      void checkForUpdate()
    }
    const onOffline = () => setOffline(true)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkForUpdate()
    }
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
    if (APP_VERSION) {
      pollTimer = setInterval(() => void checkForUpdate(), UPDATE_POLL_MS)
      document.addEventListener('visibilitychange', onVisible)
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('beforeinstallprompt', onInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    setOffline(!navigator.onLine)

    return () => {
      if (pollTimer) clearInterval(pollTimer)
      document.removeEventListener('visibilitychange', onVisible)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('beforeinstallprompt', onInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [applyUpdate])

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