'use client'

import { useTranslations } from 'next-intl'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils/cn'

/**
 * Chevron dépliant d'une diffusion.
 *
 * ⚠️ Un vrai `<button>` porteur d'`aria-expanded` et d'`aria-controls`, pas une
 * icône cliquable : c'est ce qui rend le geste utilisable au clavier et
 * annonçable par un lecteur d'écran, qui dira « réduit » ou « développé » au
 * lieu de laisser deviner. Le libellé accessible change avec l'état — « Déplier »
 * sur une carte fermée n'aurait plus de sens une fois ouverte.
 *
 * L'icône tourne au lieu d'être remplacée par une seconde : le mouvement dit
 * le sens du geste, là où deux icônes distinctes sautent sans rien expliquer.
 */
export function AnnouncementToggle({
  open,
  onToggle,
  controls,
  className,
}: {
  open: boolean
  onToggle: () => void
  /** id du bloc replié — `aria-controls`, pour relier le bouton à son contenu. */
  controls: string
  className?: string
}) {
  const t = useTranslations('messaging')

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={open ? t('announcements.collapse') : t('announcements.expand')}
      title={open ? t('announcements.collapse') : t('announcements.expand')}
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground',
        'transition-colors hover:bg-muted hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <ChevronDown
        className={cn('size-4 transition-transform duration-200', open && 'rotate-180')}
      />
    </button>
  )
}
