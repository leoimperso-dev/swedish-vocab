// Keeps the screen on while the app is talking.
//
// A dictation exercise is the one moment the learner touches nothing: the
// phone hears no input, decides the screen is idle and turns it off mid-word —
// worse on a home-screen shortcut, which runs full-screen with no browser
// chrome to tap. The Screen Wake Lock API is the only way to say otherwise
// (iOS Safari 16.4+, Chrome Android; a no-op everywhere else).
//
// Held on an idle deadline rather than per utterance: acquiring and releasing
// around every word would thrash the lock, and the learner still needs to read
// the card after the voice stops. Any speech pushes the deadline back.

const IDLE_MS = 60_000

let sentinel: WakeLockSentinel | null = null
let deadline = 0
let timer: ReturnType<typeof setTimeout> | null = null
let listening = false

function supported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator
}

async function acquire() {
  if (sentinel || document.visibilityState !== 'visible') return
  try {
    sentinel = await navigator.wakeLock.request('screen')
    // The system can drop it on its own (low battery); forget it so the next
    // call can ask again instead of trusting a dead sentinel
    sentinel.addEventListener('release', () => {
      sentinel = null
    })
  } catch {
    // Denied or unsupported — the screen simply behaves as before
  }
}

function release() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  deadline = 0
  sentinel?.release().catch(() => {})
  sentinel = null
}

function scheduleRelease() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    if (Date.now() >= deadline) release()
    else scheduleRelease()
  }, Math.max(1000, deadline - Date.now()))
}

/** Call whenever the app starts speaking; the lock lasts IDLE_MS past the last call. */
export function keepAwake(): void {
  if (!supported()) return
  deadline = Date.now() + IDLE_MS
  scheduleRelease()
  void acquire()

  if (!listening) {
    listening = true
    // The browser drops the lock when the tab is hidden and never restores it
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() < deadline) void acquire()
    })
  }
}

/** Call when speech is deliberately stopped — no reason to hold the screen then. */
export function allowSleep(): void {
  if (!supported()) return
  release()
}
