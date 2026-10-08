'use client'

import { useEffect, useState } from 'react'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

export type PushState = 'loading' | 'unsupported' | 'ios-install' | 'blocked' | 'off' | 'on'

/**
 * iOS exposes Web Push only to an app launched from the home screen — in a
 * Safari tab the API is simply absent. Telling that user "unsupported" is
 * wrong: they are one "Add to Home Screen" away.
 */
function needsHomeScreenInstall(): boolean {
  const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    // iPadOS reports itself as a Mac; a touch point gives it away
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (!iOS) return false
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return !standalone
}

/** Registers this device with the server. Assumes permission is granted. */
async function subscribe(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
    })
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    })
    return res.ok
  } catch {
    return false
  }
}

/** The subscribe call wants the VAPID key as raw bytes, not base64url. */
function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const buffer = new ArrayBuffer(raw.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return buffer
}

/**
 * Web Push state for this device, and the two actions that change it.
 *
 * A subscription is per device, never per account: the endpoint and its keys
 * are minted by the browser's own push service, so nothing server-side can
 * create one. Every device has to opt in on its own — hence both the profile
 * switch and the dashboard banner reading from here.
 */
export function usePush() {
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const detect = async (): Promise<PushState> => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC_KEY) {
        return needsHomeScreenInstall() ? 'ios-install' : 'unsupported'
      }
      if (Notification.permission === 'denied') return 'blocked'
      const reg = await navigator.serviceWorker.ready
      if (await reg.pushManager.getSubscription()) return 'on'
      // Permission already given on this device but no subscription: a new
      // install, a cleared storage, or a second device of someone who said yes
      // once. Re-subscribing silently is what they already asked for — the
      // prompt is the consent, not the button.
      if (Notification.permission === 'granted') return (await subscribe()) ? 'on' : 'off'
      return 'off'
    }
    detect()
      .then(next => { if (!cancelled) setState(next) })
      .catch(() => { if (!cancelled) setState('unsupported') })
    return () => { cancelled = true }
  }, [])

  const enable = async () => {
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off')
        return
      }
      setState((await subscribe()) ? 'on' : 'off')
    } catch {
      setState('off')
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setState('off')
    } catch {
      /* the row is dropped server-side on the first failed send anyway */
    } finally {
      setBusy(false)
    }
  }

  return { state, busy, enable, disable }
}
