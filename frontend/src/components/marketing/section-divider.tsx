import { cn } from '@/lib/utils/cn'

interface SectionDividerProps {
  /** Fond = couleur de la section du dessus, ex. `bg-cream`. */
  bgClass?: string
  /** Couleur de la vague = couleur de la section suivante, ex. `fill-secondary`. */
  fillClass: string
  /** Miroir horizontal pour varier les transitions d'une section à l'autre. */
  flip?: boolean
  className?: string
}

/**
 * Vague de transition entre deux sections du site vitrine (style landing
 * ludique) : placée en fin de section, affleurante au bord inférieur
 * (la section hôte doit donc finir en `pb-0`). Purement décorative.
 */
export function SectionDivider({ bgClass = 'bg-background', fillClass, flip = false, className }: SectionDividerProps) {
  return (
    <div aria-hidden className={cn('leading-none', bgClass, className)}>
      <svg
        viewBox="0 0 1440 90"
        preserveAspectRatio="none"
        className={cn('block h-10 w-full sm:h-14', flip && 'scale-x-[-1]')}
      >
        <path
          d="M0,55 C240,90 480,10 720,30 C960,50 1200,20 1440,50 L1440,90 L0,90 Z"
          className={fillClass}
        />
      </svg>
    </div>
  )
}
