// Renders the restricted markdown subset used by grammar lessons:
// "## " headings, "- " bullets, "> sv — fr" example blocks, **bold**, paragraphs.
import type { ReactNode } from 'react'

function renderBold(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={`${keyPrefix}-${i}`} className="text-white font-semibold">{part}</strong> : part
  )
}

export default function MarkdownLite({ body }: { body: string }) {
  const blocks: ReactNode[] = []
  const lines = body.split('\n')
  let paragraph: string[] = []
  let bullets: string[] = []
  let examples: string[] = []

  const flush = (key: number) => {
    if (paragraph.length > 0) {
      blocks.push(
        <p key={`p-${key}`} className="text-slate-300 leading-relaxed">
          {renderBold(paragraph.join(' '), `p-${key}`)}
        </p>
      )
      paragraph = []
    }
    if (bullets.length > 0) {
      blocks.push(
        <ul key={`ul-${key}`} className="space-y-1.5 pl-1">
          {bullets.map((b, i) => (
            <li key={i} className="text-slate-300 leading-relaxed flex gap-2">
              <span className="text-blue-400 shrink-0">•</span>
              <span>{renderBold(b, `b-${key}-${i}`)}</span>
            </li>
          ))}
        </ul>
      )
      bullets = []
    }
    if (examples.length > 0) {
      blocks.push(
        <div key={`ex-${key}`} className="border-l-2 border-blue-600 bg-slate-900 rounded-r-xl px-4 py-3 space-y-1.5">
          {examples.map((ex, i) => {
            const [sv, fr] = ex.split(/\s+—\s+/)
            return (
              <p key={i} className="text-sm">
                <span className="text-white font-medium">{sv}</span>
                {fr && <span className="text-slate-400"> — {fr}</span>}
              </p>
            )
          })}
        </div>
      )
      examples = []
    }
  }

  lines.forEach((rawLine, index) => {
    const line = rawLine.trimEnd()
    if (line.startsWith('## ')) {
      flush(index)
      blocks.push(
        <h2 key={`h-${index}`} className="text-lg font-bold text-white pt-3">
          {line.slice(3)}
        </h2>
      )
    } else if (line.startsWith('- ')) {
      if (paragraph.length > 0 || examples.length > 0) flush(index)
      bullets.push(line.slice(2))
    } else if (line.startsWith('> ')) {
      if (paragraph.length > 0 || bullets.length > 0) flush(index)
      examples.push(line.slice(2))
    } else if (line.trim() === '') {
      flush(index)
    } else {
      if (bullets.length > 0 || examples.length > 0) flush(index)
      paragraph.push(line)
    }
  })
  flush(lines.length)

  return <div className="space-y-4">{blocks}</div>
}
