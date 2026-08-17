'use client'

import { useCallback, useRef, useState } from 'react'

// Long enough not to fire on a normal tap, short enough not to feel stuck
const HOLD_MS = 450
// A press that travels is a scroll or a swipe, not a press
const MOVE_TOLERANCE = 10

/**
 * A long press that does not tax the plain tap: the tap still fires on release,
 * it is only suppressed once the hold has triggered. Preferred over a double
 * tap here — waiting to see if a second tap comes would delay every single-word
 * playback, and a double tap on a button zooms the page on some mobile browsers.
 */
export function useLongPress(onLongPress: () => void, onClick: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)
  const [holding, setHolding] = useState(false)

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    origin.current = null
    setHolding(false)
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    fired.current = false
    origin.current = { x: e.clientX, y: e.clientY }
    setHolding(true)
    timer.current = setTimeout(() => {
      fired.current = true
      setHolding(false)
      onLongPress()
    }, HOLD_MS)
  }, [onLongPress])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!origin.current) return
    const moved = Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y)
    if (moved > MOVE_TOLERANCE) clear()
  }, [clear])

  return {
    holding,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      // iOS pops its text-selection callout on a long press otherwise
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation()
        if (fired.current) return
        onClick()
      },
    },
  }
}
