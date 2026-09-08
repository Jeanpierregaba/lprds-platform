import {
  Blocks,
  Brain,
  CalendarCheck,
  GraduationCap,
  HeartHandshake,
  Languages,
  ShieldCheck,
  Trophy,
} from 'lucide-react'
import { Doodle } from '@/components/marketing/doodle'
import { Reveal } from '@/components/marketing/reveal'
import { DIFFERENCES } from '@/lib/marketing/data'
import { cn } from '@/lib/utils/cn'

// Roadmap verticale « Pourquoi sommes-nous différents » — inspirée de la
// maquette : ligne centrale, pastilles numérotées alternées gauche / droite,
// bandeau-titre coloré par étape. Couleurs vives assumées (une par étape,
// comme la référence), contenu 100 % issu de l'ancien site.
const DIFFERENCE_STYLES = [
  { Icon: Languages, color: '#2AA5A0' },
  { Icon: Brain, color: '#D94F2B' },
  { Icon: HeartHandshake, color: '#E8930C' },
  { Icon: ShieldCheck, color: '#B3123F' },
  { Icon: GraduationCap, color: '#0E7C7B' },
  { Icon: CalendarCheck, color: '#4D9F92' },
  { Icon: Trophy, color: '#7C3AED' },
  { Icon: Blocks, color: '#005840' },
] as const

export function DifferenceTimeline() {
  return (
    <section aria-labelledby="differences-heading" className="relative overflow-clip px-6 py-20 sm:py-28 lg:px-8">
      <Doodle src="/images/marketing/icons-decor/planete-terre.png" size={64} className="right-[3%] top-24 hidden md:block" delay={0.7} duration={8} />
      <Doodle src="/images/marketing/icons-decor/construction.png" size={56} className="bottom-24 left-[3%] hidden -rotate-6 md:block" delay={2.6} duration={6} />
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 py-2 text-sm font-semibold uppercase tracking-wide text-secondary">
            Pourquoi nous choisir
          </span>
          <h2 id="differences-heading" className="font-bold text-3xl text-primary sm:text-4xl">
            Pourquoi sommes-nous différents&nbsp;?
          </h2>
          <p className="mt-4 text-muted-foreground sm:text-lg">
          Offrir à votre enfant le meilleur, c’est lui permettre de grandir, découvrir et s’épanouir dans un environnement bienveillant, stimulant et entièrement pensé pour son éveil et sa sécurité.
          </p>
        </Reveal>

        <div
          className="relative mx-auto mt-14 max-w-5xl rounded-[2rem] px-4 py-12 sm:px-8"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent 0px, transparent 27px, color-mix(in srgb, hsl(var(--border)) 55%, transparent) 28px)',
          }}
        >
          {/* Ligne verticale centrale (décalée à gauche sur mobile). */}
          <span aria-hidden className="absolute bottom-6 left-6 top-6 w-0.5 -translate-x-1/2 bg-border md:left-1/2" />

          <div className="flex flex-col gap-12 md:gap-14">
            {DIFFERENCES.map((item, i) => {
              const style = DIFFERENCE_STYLES[i % DIFFERENCE_STYLES.length] as (typeof DIFFERENCE_STYLES)[number]
              const onRight = i % 2 === 0
              const { Icon } = style
              return (
                <Reveal key={item.id}>
                  <div className="relative md:grid md:grid-cols-2 md:gap-24 pl-10">
                    {/* Pastille sur la ligne. */}
                    <span aria-hidden className="absolute left-6 top-0 z-10 -translate-x-1/2 md:left-1/2">
                      <span
                        className="flex size-12 items-center justify-center rounded-full bg-white shadow-md"
                        style={{ border: `2px solid ${style.color}` }}
                      >
                        <span className="size-3.5 rounded-full" style={{ backgroundColor: style.color }} />
                      </span>
                    </span>
                    {/* Connecteur horizontal + point (desktop uniquement). */}
                    <span
                      aria-hidden
                      className={cn(
                        'absolute top-6 hidden h-0.5 w-10 md:block',
                        onRight ? 'left-[calc(50%+1.5rem)]' : 'right-[calc(50%+1.5rem)]',
                      )}
                      style={{ backgroundColor: style.color }}
                    />
                    <span
                      aria-hidden
                      className={cn(
                        'absolute top-[18px] hidden size-3 rounded-full md:block',
                        onRight ? 'left-[calc(50%+58px)]' : 'right-[calc(50%+58px)]',
                      )}
                      style={{ backgroundColor: style.color }}
                    />
                    {/* Contenu alterné. */}
                    <div className={cn('pl-16 md:pl-0', onRight ? 'md:col-start-2' : 'md:col-start-1 md:row-start-1')}>
                      <Icon className="size-9" strokeWidth={1.75} style={{ color: style.color }} aria-hidden="true" />
                      <div className="mt-2 font-display text-4xl font-bold leading-none" style={{ color: style.color }}>
                        {String(i + 1).padStart(2, '0')}
                      </div>
                      <span
                        className="mt-3 inline-block px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-sm"
                        style={{ backgroundColor: style.color }}
                      >
                        {item.title}
                      </span>
                      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </div>

        </div>
      </div>
    </section>
  )
}
