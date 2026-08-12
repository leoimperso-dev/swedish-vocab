'use client'

import Link from 'next/link'
import { getStrings } from '@/lib/i18n'
import { useCourse } from '@/components/CourseProvider'
import { localeOf } from '@/lib/courses'
import { AppShell } from '@/components/AppShell'
import { Card } from '@/components/ui/primitives'
import TappableText from '@/components/TappableText'
import type { Story } from '@prisma/client'

export default function StoryReader({ story }: { story: Story }) {
  const course = useCourse()
  const t = getStrings(course.native)
  const locale = localeOf(course.learned)

  const paragraphs = story.body.split(/\n\n+/)

  return (
    <AppShell title={story.title} subtitle={story.titleTranslated}>
      <Link
        href="/reading"
        className="pressable mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        {t.back}
      </Link>

      <Card className="p-5">
        <div className="space-y-5 text-[17px] leading-[2] tracking-tight">
          {paragraphs.map((paragraph, pIdx) => (
            <p key={pIdx}>
              <TappableText text={paragraph} locale={locale} t={t} />
            </p>
          ))}
        </div>
      </Card>

      <p className="mt-3 text-center text-xs text-muted-foreground">{t.tapAnyWord}</p>
    </AppShell>
  )
}
