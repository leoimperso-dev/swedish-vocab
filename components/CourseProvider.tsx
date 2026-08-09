'use client'

import { createContext, useContext } from 'react'
import { DEFAULT_COURSE, type Course, type Lang } from '@/lib/courses'

const CourseContext = createContext<Course>(DEFAULT_COURSE)

export function CourseProvider({ course, children }: { course: Course; children: React.ReactNode }) {
  return <CourseContext.Provider value={course}>{children}</CourseContext.Provider>
}

export function useCourse(): Course {
  return useContext(CourseContext)
}

// Interface language — the common case, kept as a shorthand
export function useLang(): Lang {
  return useContext(CourseContext).native
}
