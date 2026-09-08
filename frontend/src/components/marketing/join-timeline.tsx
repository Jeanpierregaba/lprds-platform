import { ArrowRight, BadgeCheck, Eye, FileText } from 'lucide-react'
import { Doodle } from '@/components/marketing/doodle'
import { MarketingButton } from '@/components/marketing/marketing-button'
import { SectionDivider } from '@/components/marketing/section-divider'
import { Reveal } from '@/components/marketing/reveal'
import { JOIN_STEPS } from '@/lib/marketing/data'
import { cn } from '@/lib/utils/cn'

// Section « Nous rejoindre » — 3 anneaux parfaits côte à côte reliés par un
// rail (demi-bordures alternées, rythme serpentin). Contenu repris de
// l'ancien site (3 étapes). Desktop : anneaux + rail ; mobile : vertical.
const JOIN_STEP_STYLES = [
  { Icon: Eye, color: '#E8930C' },
  { Icon: FileText, color: '#0E9F8A' },
  { Icon: BadgeCheck, color: '#3B82F6' },
] as const

// Anneau parfait : rounded-full + demi-bordure colorée en dégradé conique
// (moitié haute pour les étapes 1 et 3, moitié basse pour l'étape 2 —
// rythme serpentin), évidé au centre par un masque radial.
function ringBackground(color: string, topHalf: boolean): string {
  const from = topHalf ? 270 : 90
  return `conic-gradient(from ${from}deg, ${color} 0deg 180deg, hsl(var(--border)) 180deg 360deg)`
}
const RING_MASK =
  'radial-gradient(farthest-side, transparent calc(100% - 12px), black calc(100% - 11px))'

export function JoinTimeline() {
  return (
    <section aria-labelledby="join-heading" className="relative overflow-clip bg-cream px-6 pt-20 sm:pt-28 lg:px-8">
      <Doodle src="/images/marketing/icons-decor/fleche.png" size={56} className="left-[4%] top-20 hidden rotate-12 sm:block" delay={1.1} duration={5} />
      <Doodle src="/images/marketing/icons-decor/une-langue-etrangere.png" size={60} className="bottom-20 right-[4%] hidden -rotate-6 sm:block" delay={2.8} duration={7} />
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 py-2 text-sm font-semibold uppercase tracking-wide text-secondary">
            Nous rejoindre
          </span>
          <h2 id="join-heading" className="font-bold text-3xl text-primary sm:text-4xl">
            Rejoignez-nous en 3 étapes simples
          </h2>
          <p className="mt-4 text-muted-foreground sm:text-lg">
            De la première visite au premier jour de votre enfant : un parcours d&apos;inscription simple et accompagné.
          </p>
        </Reveal>

        {/* Desktop : 3 anneaux parfaits côte à côte, reliés par un rail. */}
        <div className="relative mx-auto mt-14 hidden max-w-5xl md:block">
          {/* Rail horizontal traversant les centres + pastilles d'extrémité. */}
          <span aria-hidden className="absolute left-[8%] right-[8%] top-20 h-[3px] bg-border lg:top-24" />
          <span aria-hidden className="absolute left-[8%] top-20 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#E8930C] lg:top-24" />
          <span aria-hidden className="absolute right-[8%] top-20 size-4 -translate-y-1/2 translate-x-1/2 rounded-full bg-[#3B82F6] lg:top-24" />

          <div className="relative grid grid-cols-3 gap-8">
            {JOIN_STEPS.map((step, i) => {
              const style = JOIN_STEP_STYLES[i % JOIN_STEP_STYLES.length] as (typeof JOIN_STEP_STYLES)[number]
              const { Icon } = style
              const topHalf = i % 2 === 0
              return (
                <Reveal key={step.id}>
                  <div className="flex flex-col items-center text-center">
                    <div className="relative z-10 flex size-40 items-center justify-center rounded-full bg-cream lg:size-48">
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: ringBackground(style.color, topHalf),
                          WebkitMask: RING_MASK,
                          mask: RING_MASK,
                        }}
                      />
                      <span className="relative font-display text-5xl font-black lg:text-6xl" style={{ color: style.color }}>
                        {i + 1}
                      </span>
                    </div>
                    <div className="mt-5 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-widest" style={{ color: style.color }}>
                      <Icon className="size-4" aria-hidden="true" />
                      Étape
                    </div>
                    <div className="mx-auto mt-2 h-0.5 w-10" style={{ backgroundColor: style.color }} />
                    <h3 className="mt-2 font-display text-xl font-bold text-navy">{step.title}</h3>
                    <p className="mt-1 max-w-[26ch] text-sm text-muted-foreground">{step.description}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>

        {/* Mobile : ligne verticale. */}
        <ol className="relative mx-auto mt-12 max-w-xl space-y-10 md:hidden">
          <span aria-hidden className="absolute bottom-2 left-6 top-2 w-0.5 -translate-x-1/2 bg-border" />
          {JOIN_STEPS.map((step, i) => {
            const style = JOIN_STEP_STYLES[i % JOIN_STEP_STYLES.length] as (typeof JOIN_STEP_STYLES)[number]
            const { Icon } = style
            return (
              <li key={step.id} className="relative pl-16">
                <span aria-hidden className="absolute left-6 top-0 z-10 -translate-x-1/2">
                  <span
                    className="flex size-12 items-center justify-center rounded-full bg-white font-display text-xl font-bold shadow-md"
                    style={{ border: `2px solid ${style.color}`, color: style.color }}
                  >
                    {i + 1}
                  </span>
                </span>
                <Reveal>
                  <div className={cn('flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest')} style={{ color: style.color }}>
                    <Icon className="size-4" aria-hidden="true" />
                    Étape {i + 1}
                  </div>
                  <h3 className="mt-1 font-display text-lg font-bold text-navy">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                </Reveal>
              </li>
            )
          })}
        </ol>

        <div className="mt-12 text-center">
          <Reveal>
            <MarketingButton href="/contact" size="lg" variant="tertiary">
              Réserver une visite
              <ArrowRight className="size-4" />
            </MarketingButton>
          </Reveal>
        </div>
      </div>
      {/* Vague de transition Rejoindre (crème) → Actualités (bleu très clair). */}
      <SectionDivider bgClass="bg-cream" fillClass="fill-muted" flip className="mt-12" />
    </section>
  )
}
