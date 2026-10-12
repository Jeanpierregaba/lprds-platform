'use client'

import { useCallback, useEffect, useState } from 'react'

import { notificationsApi } from '@/lib/api/notifications.api'
import { clientLocale } from '@/i18n/client-locale'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import en from '../../messages/en/errors.json'
import fr from '../../messages/fr/errors.json'

/** Ces messages sortent d'un hook appelé hors rendu : la langue vient de
 *  `clientLocale()`, comme pour getApiErrorMessage. */
function pushError(key: 'pushUnsupported' | 'pushDenied'): string {
  return (clientLocale() === 'en' ? en : fr)[key]
}

/** base64url SANS remplissage — c'est ce que le protocole Web Push attend, et
 *  ce que le backend valide (87 et 22 caractères).
 *
 *  ⚠️ `btoa` seul produit du base64 STANDARD (`+`, `/`, `=`). La version
 *  précédente envoyait donc des clés que le serveur de push n'aurait pas su
 *  relire — défaut invisible, puisque la réponse du backend n'était de toute
 *  façon jamais vérifiée. */
function toBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return ''
  const octets = new Uint8Array(buffer)
  let brut = ''
  for (const octet of octets) brut += String.fromCharCode(octet)
  return window.btoa(brut).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(base64url: string): Uint8Array {
  const remplissage = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + remplissage).replace(/-/g, '+').replace(/_/g, '/')
  const brut = window.atob(base64)
  const sortie = new Uint8Array(brut.length)
  for (let i = 0; i < brut.length; i += 1) sortie[i] = brut.charCodeAt(i)
  return sortie
}

export interface PushSubscriptionState {
  /** Le navigateur sait-il faire du push (iOS exige l'app installée). */
  isSupported: boolean
  permission: NotificationPermission | null
  /** Cet APPAREIL est-il abonné — pas « ce compte quelque part ». */
  isSubscribed: boolean
  isBusy: boolean
  error: string | null
}

/**
 * Abonnement de CET appareil aux notifications push.
 *
 * ⚠️ **La permission n'est plus demandée au montage.** La version précédente
 * appelait `Notification.requestPermission()` dans un `useEffect`, donc à
 * chaque affichage de la page : une demande sans geste de l'utilisateur, que
 * les navigateurs pénalisent (Chrome la bloque après un refus, Safari l'ignore
 * hors geste) et qui apparaissait sans qu'on ait rien demandé. Un refus
 * accidentel est durable et ne se défait que dans les réglages du navigateur —
 * le coût d'un prompt mal placé est donc définitif.
 *
 * Au montage, on se contente de LIRE l'état : support, permission déjà donnée,
 * abonnement déjà posé.
 */
export function usePushSubscription() {
  const [state, setState] = useState<PushSubscriptionState>({
    isSupported: false,
    permission: null,
    isSubscribed: false,
    isBusy: false,
    error: null,
  })

  const supported = useCallback(
    () =>
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window,
    [],
  )

  useEffect(() => {
    if (!supported()) {
      setState((prev) => ({ ...prev, isSupported: false }))
      return
    }
    let annule = false
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.pushManager.getSubscription() ?? null)
      .then((subscription) => {
        if (annule) return
        setState((prev) => ({
          ...prev,
          isSupported: true,
          permission: Notification.permission,
          isSubscribed: subscription !== null,
        }))
      })
      .catch(() => {
        if (!annule) setState((prev) => ({ ...prev, isSupported: true }))
      })
    return () => {
      annule = true
    }
  }, [supported])

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported()) {
      setState((prev) => ({ ...prev, error: pushError('pushUnsupported') }))
      return false
    }

    setState((prev) => ({ ...prev, isBusy: true, error: null }))
    try {
      // Appelé depuis un clic : c'est la seule position où un navigateur
      // accepte durablement cette demande.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState((prev) => ({
          ...prev,
          permission,
          isBusy: false,
          error: pushError('pushDenied'),
        }))
        return false
      }

      const registration = await navigator.serviceWorker.ready
      const { data } = await notificationsApi.getVapidPublicKey()

      // Un abonnement déjà posé est RÉENREGISTRÉ côté serveur plutôt que
      // réutilisé en silence : c'est exactement le cas d'un appareil dont la
      // ligne a disparu (base réinitialisée, clés VAPID changées, abonnement
      // révoqué puis nettoyé). Sans ce renvoi, l'écran afficherait « activé »
      // pour un appareil que le serveur ne connaît plus.
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: fromBase64Url(data.vapidPublicKey) as unknown as BufferSource,
        }))

      await notificationsApi.subscribe({
        endpoint: subscription.endpoint,
        p256dh: toBase64Url(subscription.getKey('p256dh')),
        auth_key: toBase64Url(subscription.getKey('auth')),
      })

      setState((prev) => ({
        ...prev,
        permission,
        isSubscribed: true,
        isBusy: false,
        error: null,
      }))
      return true
    } catch (err) {
      setState((prev) => ({ ...prev, isBusy: false, error: getApiErrorMessage(err) }))
      return false
    }
  }, [supported])

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!supported()) return false

    setState((prev) => ({ ...prev, isBusy: true, error: null }))
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()

      if (subscription) {
        // Le serveur d'abord : s'il refuse, l'abonnement du navigateur est
        // encore là et l'appareil reste joignable. L'inverse laisserait une
        // ligne en base pour un endpoint déjà mort.
        await notificationsApi.unsubscribe(subscription.endpoint)
        await subscription.unsubscribe()
      }

      setState((prev) => ({ ...prev, isSubscribed: false, isBusy: false, error: null }))
      return true
    } catch (err) {
      setState((prev) => ({ ...prev, isBusy: false, error: getApiErrorMessage(err) }))
      return false
    }
  }, [supported])

  const sendTest = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, isBusy: true, error: null }))
    try {
      const { data } = await notificationsApi.sendTest()
      setState((prev) => ({ ...prev, isBusy: false }))
      return data.sent > 0
    } catch (err) {
      setState((prev) => ({ ...prev, isBusy: false, error: getApiErrorMessage(err) }))
      return false
    }
  }, [])

  return { ...state, subscribe, unsubscribe, sendTest }
}
