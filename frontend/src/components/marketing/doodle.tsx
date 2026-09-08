import Image from 'next/image'
import { cn } from '@/lib/utils/cn'

interface DoodleProps {
  /** Chemin public, ex. `/images/marketing/icons-decor/star.png`. */
  src: string
  /** Taille d'affichage en px (les sources font 128×128). */
  size?: number
  /** Positionnement (absolute + insets), rotation, visibilité responsive. */
  className?: string
  /** Décalage de phase de la boucle de flottement, en secondes. */
  delay?: number
  /** Durée d'une boucle de flottement, en secondes. */
  duration?: number
}

/**
 * Doodle décoratif du site vitrine (style landing ludique) : image
 * purement ornementale (aria-hidden, non draggable, hors lecteurs
 * d'écran), flottement doux en boucle via `animate-doodle`.
 * La section parente doit être `relative` (`overflow-clip` recommandé).
 */
export function Doodle({ src, size = 48, className, delay = 0, duration = 5 }: DoodleProps) {
  return (
    <span
      aria-hidden
      className={cn('animate-doodle pointer-events-none absolute select-none', className)}
      style={{ width: size, height: size, animationDelay: `${delay}s`, animationDuration: `${duration}s` }}
    >
      <Image src={src} alt="" width={size} height={size} draggable={false} className="h-full w-full" />
    </span>
  )
}
