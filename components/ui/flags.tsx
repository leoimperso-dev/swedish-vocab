// Flat SVG flags — emoji flags do not render on every platform, and the header
// needs a crisp fixed-size mark. Text-only contexts use flagOf() in lib/courses.ts.
import type { Lang } from '@/lib/courses'

const CLASS = 'h-4 w-6'

function SwedishFlag() {
  return (
    <svg viewBox="0 0 16 10" className={CLASS} aria-hidden="true">
      <rect width="16" height="10" fill="#005293" />
      <rect x="5" width="2" height="10" fill="#FECB00" />
      <rect y="4" width="16" height="2" fill="#FECB00" />
    </svg>
  )
}

function FrenchFlag() {
  return (
    <svg viewBox="0 0 16 10" className={CLASS} aria-hidden="true">
      <rect width="16" height="10" fill="#FFFFFF" />
      <rect width="5.33" height="10" fill="#002395" />
      <rect x="10.67" width="5.33" height="10" fill="#ED2939" />
    </svg>
  )
}

function UkFlag() {
  return (
    <svg viewBox="0 0 16 10" className={CLASS} aria-hidden="true">
      <rect width="16" height="10" fill="#012169" />
      <path d="M0 0l16 10M16 0L0 10" stroke="#FFFFFF" strokeWidth="2" />
      <path d="M0 0l16 10M16 0L0 10" stroke="#C8102E" strokeWidth="1.2" />
      <path d="M8 0v10M0 5h16" stroke="#FFFFFF" strokeWidth="3.2" />
      <path d="M8 0v10M0 5h16" stroke="#C8102E" strokeWidth="1.9" />
    </svg>
  )
}

const FLAGS: Record<Lang, () => React.JSX.Element> = {
  sv: SwedishFlag,
  fr: FrenchFlag,
  en: UkFlag,
}

export function Flag({ lang }: { lang: Lang }) {
  const Component = FLAGS[lang]
  return <Component />
}
