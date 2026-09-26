import { cn } from '@/lib/utils'

/**
 * The headword of an exercise, at the largest size that still fits.
 *
 * The length is handed to CSS rather than measured in JS: the card is often
 * rendered before fonts settle, and a size that jumps once the measurement
 * lands is worse than one that is right immediately.
 */
export function HeroWord({ text, className }: { text: string; className?: string }) {
  // The longest run without a break opportunity is what actually has to fit
  const longest = Math.max(...text.split(/[\s-]+/).map(part => part.length), 1)
  return (
    <div className={cn('hero-word-fit', className)}>
      <p
        className="text-hero-word"
        style={{ '--word-length': longest } as React.CSSProperties}
      >
        {text}
      </p>
    </div>
  )
}
