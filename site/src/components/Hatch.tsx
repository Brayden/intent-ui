/** A cross-hatched band that separates framed sections (the rails' pattern, inside the frame). */
export function HatchBand({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`hatch h-10 border-y border-kumo-line sm:h-14 ${className}`} />;
}
