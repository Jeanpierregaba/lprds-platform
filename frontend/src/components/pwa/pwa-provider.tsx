'use client'

import { useLocale, useTranslations } from 'next-intl'

import { Download, Smartphone, WifiOff, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils/cn'
import { notifyLocaleChanged } from '@/lib/pwa/sw-messages'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/* ⚠️ `'standalone' in navigator` TESTE L'EXISTENCE DE LA PROPRIÉTÉ, pas sa
 * valeur — et Safari l'expose en permanence : sur iOS depuis toujours, sur
 * macOS depuis Safari 17 (« Ajouter au Dock »), où elle vaut `false` dans un
 * onglet ordinaire. L'application se croyait donc DÉJÀ INSTALLÉE chez tout
 * utilisateur Safari, et le bouton d'installation n'était jamais proposé.
 *
 * Signalé par un établissement, et l'ironie est entière : le mode guidé écrit
 * précisément POUR Safari (`detectInstallFallback` ci-dessous) était rendu
 * inatteignable par la ligne censée détecter l'état installé de Safari. Le
 * test juste en dessous, lui, était correct depuis le début. */
const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as { standalone?: boolean }).standalone === true

type InstallFallback = 'ios' | 'mac' | null

/** `beforeinstallprompt` n'existe que sur Chromium : ailleurs, on détecte la
 * plateforme pour proposer une installation manuelle guidée (Safari iOS/macOS).
 * Sur les navigateurs sans aucun parcours d'installation, on n'affiche rien. */
const detectInstallFallback = (): InstallFallback => {
  const ua = window.navigator.userAgent
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
  if (isIOS) return 'ios'
  const isSafari =
    /Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua) && /Apple Computer/.test(window.navigator.vendor)
  if (isSafari) return 'mac'
  return null
}

// Version compilée dans le bundle au build (NEXT_PUBLIC_APP_VERSION, cf.
// scripts/stamp-version.mjs). Absente en dev local → auto-update désactivé.
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || ''
// Fréquence du sondage de version quand l'onglet reste ouvert.
const UPDATE_POLL_MS = 15 * 60 * 1000
const UPDATED_FLAG = 'lprds-sw-updated'
// Masquage du bouton d'installation (persisté — le navigateur propose
// toujours l'installation via son menu). Effacé si l'app est installée.
const INSTALL_DISMISSED_FLAG = 'lprds-install-dismissed'

// Rendu de la balise `<b>` des libellés d'installation (next-intl `t.rich`).
const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common')
  const locale = useLocale()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState<boolean>(false)
  const [offline, setOffline] = useState<boolean>(false)
  const [installDismissed, setInstallDismissed] = useState<boolean>(false)
  const [installFallback, setInstallFallback] = useState<InstallFallback>(null)
  const [helpOpen, setHelpOpen] = useState<boolean>(false)
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
    toast.info(t('newVersion', { reason }))
    // Court délai pour laisser le toast s'afficher avant le rechargement.
    window.setTimeout(() => window.location.reload(), 1500)
  }, [t])

  useEffect(() => {
    // Toast de confirmation après un rechargement provoqué par une mise à jour.
    try {
      if (sessionStorage.getItem(UPDATED_FLAG)) {
        sessionStorage.removeItem(UPDATED_FLAG)
        toast.success(t('appUpdated'))
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
          applyUpdate(t('reasonVersion'))
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
      if (hadController) applyUpdate(t('reasonWorker'))
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
      try {
        localStorage.removeItem(INSTALL_DISMISSED_FLAG)
      } catch {
        // Stockage indisponible — on ignore.
      }
    }

    void register()
    if (isStandalone()) {
      setInstalled(true)
    } else {
      // Pas encore de `beforeinstallprompt` ? Sur Safari le bouton
      // d'installation n'apparaîtrait jamais : on prépare le mode guidé.
      setInstallFallback(detectInstallFallback())
    }
    try {
      if (localStorage.getItem(INSTALL_DISMISSED_FLAG)) setInstallDismissed(true)
    } catch {
      // Stockage indisponible — le bouton reste visible.
    }
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

  /* L'accueil précaché suit la langue CHOISIE, pas celle de l'appareil.
   *
   * Effet distinct de l'enregistrement du worker ci-dessus, et volontairement
   * dépendant de `locale` seul : il doit rejouer à chaque bascule de langue,
   * alors que l'enregistrement ne doit avoir lieu qu'une fois.
   *
   * Posté ici plutôt que depuis `useLocaleSwitch()` : à ce stade la page est
   * rendue dans la nouvelle langue, donc le cookie de langue est bel et bien
   * posé — c'est lui qui décidera si `/` est encore redirigé. Depuis le geste
   * de bascule, le message partirait avant l'écriture du cookie et le worker
   * redemanderait l'accueil dans l'ANCIENNE langue.
   */
  useEffect(() => {
    notifyLocaleChanged(locale)
  }, [locale])

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return
    setDeferredPrompt(null)
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setInstalled(true)
  }, [deferredPrompt])

  const dismissInstall = useCallback(() => {
    setInstallDismissed(true)
    try {
      localStorage.setItem(INSTALL_DISMISSED_FLAG, '1')
    } catch {
      // Stockage indisponible — masqué pour la session en cours seulement.
    }
  }, [])

  const showInstall = deferredPrompt !== null && !installed && !installDismissed
  const showFallback = deferredPrompt === null && installFallback !== null && !installed && !installDismissed

  return (
    <div className="contents">
      {children}

      {(showInstall || showFallback) && (
        <div className="fixed bottom-5 right-5 z-50">
          <button
            type="button"
            onClick={() => (showInstall ? void promptInstall() : setHelpOpen(true))}
            className={cn(
              'inline-flex h-12 items-center gap-2 rounded-full',
              'bg-primary px-5 text-sm font-medium text-primary-foreground',
              'shadow-[0_4px_0_#D88D16] hover:translate-y-0.5 hover:shadow-none',
              'transition-all motion-reduce:transition-none',
            )}
          >
            {showFallback ? (
              <Smartphone className="size-4" aria-hidden="true" />
            ) : (
              <Download className="size-4" aria-hidden="true" />
            )}
            {t('pwa.install')}
          </button>
          <button
            type="button"
            onClick={dismissInstall}
            aria-label={t('pwa.dismiss')}
            title={t('pwa.hide')}
            className={cn(
              'absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full',
              'bg-card text-muted-foreground shadow-soft ring-1 ring-border',
              'transition hover:text-foreground',
            )}
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('pwa.install')}</DialogTitle>
            <DialogDescription>
              {t(installFallback === 'ios' ? 'pwa.iosIntro' : 'pwa.macIntro')}
            </DialogDescription>
          </DialogHeader>
          {installFallback === 'ios' ? (
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>{t.rich('pwa.iosStep1', { b: strong })}</li>
              <li>{t.rich('pwa.iosStep2', { b: strong })}</li>
              <li>{t.rich('pwa.iosStep3', { b: strong })}</li>
            </ol>
          ) : (
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>{t.rich('pwa.macStep1', { b: strong })}</li>
              <li>{t.rich('pwa.macStep2', { b: strong })}</li>
              <li>{t.rich('pwa.macStep3', { b: strong })}</li>
            </ol>
          )}
        </DialogContent>
      </Dialog>

      {offline && (
        <div
          role="status"
          className={cn(
            'fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 py-2 text-sm',
            'border-b border-warning/40 bg-warning text-white',
          )}
        >
          <WifiOff className="size-4" aria-hidden="true" />
          {t('pwa.offline')}
        </div>
      )}
    </div>
  )
}