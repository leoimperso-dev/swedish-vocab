import type { Word, UserWord } from '@prisma/client'

export type ExerciseType = 'FLASHCARD' | 'QCM' | 'TYPING' | 'CONJUGATION' | 'CLOZE'

export type AnswerResult = 'correct' | 'approximate' | 'incorrect'

export interface WordWithProgress extends Word {
  userProgress: UserWord[]
}

export interface ExerciseWord {
  word: Word
  userWord: UserWord | null
  exerciseType: ExerciseType
}

export interface AnswerPayload {
  wordId: string
  result: AnswerResult
  exerciseType: ExerciseType
  timeSpent: number
  sessionId: string
}

export interface SessionSummary {
  sessionId: string
  wordsStudied: number
  wordsCorrect: number
  wordsApprox: number
  xpGained: number
  bestCombo: number
  newAchievements: string[]
  streakCurrent: number
  leveledUp: boolean
}

export interface VerbForms {
  present: string
  preterit: string
  supine: string
}

export interface NounForms {
  plural: string
}

export interface AdjForms {
  ett: string
  plural: string
  comparative?: string
  superlative?: string
}
