"use client"

import { useEffect, useState, useCallback } from "react"
import { useAuthStore } from "@/lib/stores/auth.store"
import { getApiErrorMessage } from "@/lib/utils/api-error"

export interface PushSubscriptionState {
  isSupported: boolean
  isPermissionGranted: boolean | null
  subscription: PushSubscription | null
  error: string | null
}

export function usePushSubscription() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const [result, setResult] = useState<PushSubscriptionState>({
    isSupported: false,
    isPermissionGranted: null,
    subscription: null,
    error: null,
  })

  const checkSupport = useCallback(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setResult({
        isSupported: false,
        isPermissionGranted: null,
        subscription: null,
        error: "Push notifications ne sont pas supportés par ce navigateur.",
      })
      return false
    }
    return true
  }, [])

  const requestPermission = useCallback(async () => {
    if (!checkSupport()) return false

    try {
      const permission = await Notification.requestPermission()
      setResult((prev) => ({
        ...prev,
        isPermissionGranted: permission === "granted",
      }))

      if (permission !== "granted") {
        setResult({
          ...result,
          error: "Permission de notification refusée par l'utilisateur.",
        })
      }
      return permission === "granted"
    } catch (err) {
      setResult({
        ...result,
        error: getApiErrorMessage(err),
      })
      return false
    }
  }, [checkSupport])

  const getVapidPublicKey = useCallback(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/notifications/vapid-public-key`, {
        credentials: "include",
      })
      if (!res.ok) throw new Error("Impossible de récupérer la clé VAPID")
      const { vapidPublicKey } = await res.json()
      return vapidPublicKey
    } catch (err) {
      setResult({
        ...result,
        error: getApiErrorMessage(err),
      })
      return null
    }
  }, [])

  const subscribe = useCallback(async (): Promise<PushSubscription | null> => {
    if (!checkSupport()) return null
    if (result.isPermissionGranted === false) {
      setResult({ ...result, error: "Permission requise pour s'abonner aux push." })
      return null
    }

    const key = await getVapidPublicKey()
    if (!key) return null

    try {
      const existing = await navigator.serviceWorker.getRegistration()
      const existingSub = await existing?.pushManager.getSubscription()
      if (existingSub) {
        // Already subscribed, return existing
        setResult({ ...result, subscription: existingSub, isPermissionGranted: true })
        return existingSub
      }

      const subscription = await existing?.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8(key) as unknown as BufferSource,
      })

      if (!subscription) return null

      // Send subscription to backend
      if (accessToken) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/notifications/subscriptions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            p256dh: btoa(
              String.fromCharCode(...new Uint8Array(subscription.getKey("p256dh") || new ArrayBuffer(0))),
            ),
            auth: btoa(
              String.fromCharCode(...new Uint8Array(subscription.getKey("auth") || new ArrayBuffer(0))),
            ),
          }),
          credentials: "include",
        })
      }

      setResult({
        isSupported: true,
        isPermissionGranted: true,
        subscription,
        error: null,
      })
      return subscription
    } catch (err) {
      setResult({
        ...result,
        error: getApiErrorMessage(err),
      })
      return null
    }
  }, [checkSupport, getVapidPublicKey, result.isPermissionGranted, accessToken])

  const unsubscribe = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration) return
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        await subscription.unsubscribe()
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/notifications/subscriptions`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          credentials: "include",
        })
      }

      setResult({
        ...result,
        isPermissionGranted: false,
        subscription: null,
        error: null,
      })
    } catch (err) {
      setResult({
        ...result,
        error: getApiErrorMessage(err),
      })
    }
  }, [accessToken, result.isPermissionGranted])

  // Auto-check on mount
  useEffect(() => {
    if (!result.isSupported && checkSupport()) {
      // Support now available, check permission
      Notification.requestPermission().then((permission) => {
        setResult((prev) => ({
          ...prev,
          isPermissionGranted: permission === "granted",
        }))
      })
    }
  }, [checkSupport, result.isSupported])

  return {
    ...result,
    requestPermission,
    subscribe,
    unsubscribe,
  }
}

function urlBase64ToUint8(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/")

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}