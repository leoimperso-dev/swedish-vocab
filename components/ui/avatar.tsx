import Image from 'next/image'

/** Google profile picture, falling back to the initial on a gradient. */
export function Avatar({
  name,
  image,
  size = 36,
}: {
  name: string | null
  image: string | null
  size?: number
}) {
  if (image) {
    return (
      <Image
        src={image}
        alt={name ?? ''}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full bg-gradient-nordic font-display text-sm font-semibold text-primary-foreground"
    >
      {name?.[0]?.toUpperCase() ?? '?'}
    </span>
  )
}
