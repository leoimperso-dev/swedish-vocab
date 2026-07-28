// SM-2 spaced repetition algorithm
// Quality: 0=incorrect, 3=approximate, 4=correct, 5=correct+fast

export type Quality = 0 | 3 | 4 | 5

export interface SM2State {
  easeFactor: number
  interval: number
  repetitions: number
  nextReview: Date
}

export function sm2Update(state: SM2State, quality: Quality): SM2State {
  let { easeFactor, interval, repetitions } = state

  if (quality < 3) {
    interval = 1
    repetitions = 0
    easeFactor = Math.max(1.3, easeFactor - 0.8)
  } else {
    if (repetitions === 0) interval = 1
    else if (repetitions === 1) interval = 6
    else interval = Math.round(interval * easeFactor)

    repetitions++
    easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * 0.08))
  }

  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + interval)

  return { easeFactor, interval, repetitions, nextReview }
}

export function isMastered(state: SM2State): boolean {
  return state.interval > 21
}

export function qualityFromResult(result: 'correct' | 'approximate' | 'incorrect'): Quality {
  switch (result) {
    case 'correct': return 4
    case 'approximate': return 3
    case 'incorrect': return 0
  }
}
