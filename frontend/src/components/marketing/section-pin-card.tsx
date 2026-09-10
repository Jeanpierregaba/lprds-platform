import { Baby, BookOpen, Cloud, GraduationCap, Pencil, Shapes, Sun } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { SectionAgeGroup } from '@/lib/marketing/data'

// Style « note épinglée » : panneau pastel intérieur, numéro manuscrit,
// punaise colorée, légère rotation en quinconce. Partagé entre l'aperçu de
// l'accueil et la page Nos Sections pour un rendu strictement similaire.
export const SECTION_PIN_STYLES = [
  { panel: 'bg-[#009f98]', number: 'text-[#ffffff]', pin: 'bg-[#009f98]', rotate: 'sm:-rotate-2', offset: '' },
  { panel: 'bg-[#f5a82e]', number: 'text-[#ffffff]', pin: 'bg-[#f5a82e]', rotate: 'sm:rotate-2', offset: 'sm:mt-10' },
  { panel: 'bg-[#174f33]', number: 'text-[#ffffff]', pin: 'bg-[#174f33]', rotate: 'sm:-rotate-1', offset: '' },
] as const

type PinIcon = React.ComponentType<{ className?: string }>

const SECTION_PIN_ICONS: Record<string, PinIcon> = {
  creche_etoile: Baby,
  creche_nuage: Cloud,
  creche_soleil: Sun,
  garderie: Shapes,
  maternelle_ps: Pencil,
  maternelle_ms: BookOpen,
  maternelle_gs: GraduationCap,
}

const CATEGORY_PIN_ICONS: Record<SectionAgeGroup['category'], PinIcon> = {
  creche: Baby,
  garderie: Shapes,
  maternelle: GraduationCap,
}

/** Icône de la carte : spécifique à la section, repli sur la catégorie. */
export function sectionPinIcon(section: SectionAgeGroup): PinIcon {
  return SECTION_PIN_ICONS[section.id] ?? CATEGORY_PIN_ICONS[section.category] ?? Baby
}

/**
 * Carte « note épinglée » — contenu seul (sans wrapper interactif) : l'appelant
 * l'enveloppe dans un <Link> (accueil) ou un <button> (page Nos Sections,
 * ouvre le détail), avec la classe `group` pour le survol de l'icône.
 */
export function SectionPinCard({
  index,
  icon: Icon,
  title,
  subtitle,
  description,
  footer,
}: {
  /** Position globale (numéro 01, 02… + couleur cyclée — stable entre les pages). */
  index: number
  icon: PinIcon
  title: string
  subtitle?: string
  description: string
  footer?: React.ReactNode
}) {
  const style = SECTION_PIN_STYLES[index % SECTION_PIN_STYLES.length] as (typeof SECTION_PIN_STYLES)[number]
  return (
    <span
      className={cn(
        'relative block h-full rounded-[1.75rem] bg-white p-3 pb-4 shadow-xl ring-1 ring-black/5 transition-all duration-300 hover:rotate-0 hover:-translate-y-1.5 hover:shadow-2xl',
        style.rotate
      )}
    >
      {/* Punaise */}
      <span aria-hidden className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
        <span className={cn('relative block size-6 rounded-full shadow-md ring-4 ring-white', style.pin)}>
          <span className="absolute left-1 top-1 block size-1.5 rounded-full bg-white" />
        </span>
      </span>
      <span className={cn('block rounded-[1.25rem] p-5 pt-7', style.panel)}>
        <span className="flex items-start justify-between gap-3">
          <span className={cn('font-display text-3xl italic leading-none', style.number)}>
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/80 ring-1 ring-black/5 transition-transform duration-300 group-hover:scale-110">
            <Icon className="size-5 text-navy" aria-hidden="true" />
          </span>
        </span>
        <span className="mt-1 block font-display text-2xl font-bold text-white">{title}</span>
        {subtitle && (
          <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-white/80">{subtitle}</span>
        )}
        <span className="mt-2 block break-words text-sm leading-relaxed text-white">{description}</span>
        {footer}
      </span>
    </span>
  )
}
