import type { Metadata } from 'next'
import { localeAlternates } from '@/i18n/metadata'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import Image from 'next/image'
import { Compass, Heart, Target } from 'lucide-react'
import { PageHero } from '@/components/marketing/page-hero'
import { CtaBand } from '@/components/marketing/cta-band'
import { Reveal } from '@/components/marketing/reveal'
import { buildPartners, buildStats, BRAND } from '@/lib/marketing/data'

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'marketing.about.meta' })
  return {
    title: t('title', { name: BRAND.name }),
    description: t('description'),
    alternates: localeAlternates('/a-propos', locale),
  }
}

export default function AboutPage() {
  const t = useTranslations('marketing')
  const tAbout = useTranslations('marketing.about')

  const history = [
    tAbout('history.p1'),
    tAbout('history.p2', { name: BRAND.name }),
    tAbout('history.p3'),
    tAbout('history.p4'),
  ]
  const stats = buildStats(t)
  const partners = buildPartners(t)

  return (
    <>
      <PageHero
        title={tAbout('hero.title')}
        subtitle={tAbout('hero.subtitle')}
        badge={tAbout('hero.badge')}
        Icon={Heart}
        image="/images/marketing/about-sec.png"
      />

      {/* Notre histoire */}
      <section className="px-4 py-14 sm:px-6 sm:py-28 lg:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <h2 className="font-bold text-3xl text-primary sm:text-4xl">{tAbout('history.title')}</h2>
            <div className="mt-6 space-y-4 text-muted-foreground">
              {history.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="relative aspect-[4/3] overflow-hidden rounded-[2.5rem] shadow-xl">
              <Image src="/images/marketing/about-img.png" alt={tAbout('history.imageAlt')} fill className="object-cover" sizes="(min-width: 1024px) 50vw, 100vw" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="bg-muted/40 px-4 py-14 sm:px-6 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="font-bold text-3xl text-primary sm:text-4xl">{tAbout('purpose.title')}</h2>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
            <Reveal className="rounded-3xl bg-background p-6 shadow-sm ring-1 ring-border sm:p-8">
              <Target className="size-10 text-tertiary" />
              <h3 className="mt-5 font-bold text-xl text-secondary">{tAbout('purpose.missionTitle')}</h3>
              <p className="mt-3 text-muted-foreground">
                {tAbout('purpose.missionBody')}
              </p>
            </Reveal>
            <Reveal delay={0.1} className="rounded-3xl bg-background p-6 shadow-sm ring-1 ring-border sm:p-8">
              <Compass className="size-10 text-tertiary" />
              <h3 className="mt-5 font-bold text-xl text-secondary">{tAbout('purpose.visionTitle')}</h3>
              <p className="mt-3 text-muted-foreground">
                {tAbout('purpose.visionBody')}
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-secondary py-14 text-primary-foreground">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-6 sm:grid-cols-4 lg:px-8">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-bold text-3xl sm:text-4xl">{s.value}</div>
              <div className="mt-1 text-xs text-primary-foreground/70 sm:text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Nos partenaires */}
      <section className="px-4 py-14 sm:px-6 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mx-auto max-w-3xl text-center">
            <h2 className="font-bold text-3xl text-primary sm:text-4xl">{tAbout('partners.title')}</h2>
            <p className="mt-4 text-muted-foreground">
              {tAbout('partners.body', { name: BRAND.name })}
            </p>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {partners.map((partner, i) => (
              <Reveal key={partner.id} delay={(i % 3) * 0.06} className="rounded-2xl bg-muted/50 p-6 text-center">
                <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-accent/15">
                  <span className="font-display text-xl text-tertiary">{partner.name.charAt(0)}</span>
                </div>
                <h3 className="mt-4 font-bold text-base text-secondary">{partner.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{partner.role}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  )
}
