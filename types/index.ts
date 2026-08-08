import type { Word, UserWord } from '@prisma/client'
import type { Direction } from '@/lib/courses'

export type ExerciseType = 'FLASHCARD' | 'QCM' | 'TYPING' | 'CONJUGATION' | 'CLOZE'

export type AnswerResult = 'correct' | 'approximate' | 'incorrect'

export interface WordWithProgress extends Word {
  userProgress: UserWord[]
}

export interface ExerciseWord {
  word: Word
  userWord: UserWord | null
  exerciseType: ExerciseType
  distractors?: string[]
}

export interface AnswerPayload {
  wordId: string
  result: AnswerResult
  exerciseType: ExerciseType
  direction: Direction
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

export interface NounForms {
  plural: string
}

export interface AdjForms {
  ett: string
  plural: string
  comparative?: string
  superlative?: string
}
