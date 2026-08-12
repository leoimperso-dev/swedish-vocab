'use client'

import { createContext, useContext } from 'react'
import { DEFAULT_COURSE, type Course, type Lang } from '@/lib/courses'
import type { CefrLevel } from '@/lib/cefr'

interface CourseContextValue {
  course: Course
  // CEFR level declared for the learned language, null until the user picks one
  level: CefrLevel | null
}

const CourseContext = createContext<CourseContextValue>({ course: DEFAULT_COURSE, level: null })

export function CourseProvider({ course, level, children }: {
  course: Course
  level: CefrLevel | null
  children: React.ReactNode
}) {
  return <CourseContext.Provider value={{ course, level }}>{children}</CourseContext.Provider>
}

export function useCourse(): Course {
  return useContext(CourseContext).course
}

export function useLevel(): CefrLevel | null {
  return useContext(CourseContext).level
}

// Interface language — the common case, kept as a shorthand
export function useLang(): Lang {
  return useContext(CourseContext).course.native
}
