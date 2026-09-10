import type { Metadata } from 'next'
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { PageHero } from '@/components/marketing/page-hero'
import { ContactForm } from '@/components/marketing/contact-form'
import { Reveal } from '@/components/marketing/reveal'
import { MarketingButton } from '@/components/marketing/marketing-button'
import { SECTION_PIN_STYLES, SectionPinCard } from '@/components/marketing/section-pin-card'
import { BRAND } from '@/lib/marketing/data'

export const metadata: Metadata = {
  title: `Contact — ${BRAND.name}`,
  description: 'Une question, un projet d’inscription ? Contactez Les Petits Rayons de Soleil à Djidjolé, Lomé.',
}

const QUICK_CONTACTS = [
  { Icon: Phone, label: 'Téléphone', value: BRAND.phone, href: BRAND.phoneHref },
  { Icon: MessageCircle, label: 'WhatsApp', value: 'Discuter directement', href: BRAND.whatsapp },
  { Icon: Mail, label: 'Email', value: BRAND.email, href: `mailto:${BRAND.email}` },
]

export default function ContactPage() {
  return (
    <>
      <PageHero
        title="Contactez-nous"
        subtitle="Une question ? Un projet d’inscription ? Notre équipe est là pour vous accompagner et vous renseigner."
        badge="Contact"
        Icon={Mail}
        image="/images/marketing/contactPic.png"
      />

      <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-10 sm:grid-cols-3 sm:gap-8">
          {QUICK_CONTACTS.map(({ Icon, label, value, href }, i) => {
            const style = SECTION_PIN_STYLES[i % SECTION_PIN_STYLES.length] as (typeof SECTION_PIN_STYLES)[number]
            return (
              <Reveal key={label} delay={i * 0.06} className={style.offset}>
                <a
                  href={href}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  aria-label={`${label} — ${value}`}
                  className="group relative block h-full"
                >
                  <SectionPinCard
                    index={i}
                    icon={Icon}
                    title={label}
                    description={value}
                  />
                </a>
              </Reveal>
            )
          })}
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-10 lg:grid-cols-5">
          <Reveal className="rounded-3xl bg-background p-6 shadow-sm ring-1 ring-border sm:p-10 lg:col-span-3">
            <h2 className="font-bold text-2xl text-secondary">Envoyez-nous un message</h2>
            <p className="mt-1 text-sm text-muted-foreground">Nous répondons généralement sous 24 à 48h ouvrées.</p>
            <div className="mt-8">
              <ContactForm />
            </div>
          </Reveal>

          <Reveal delay={0.1} className="space-y-6 lg:col-span-2">
            <div className="rounded-3xl bg-tertiary p-6 text-primary-foreground sm:p-8">
              <MapPin className="size-6 text-secondary" />
              <h3 className="mt-4 font-bold text-lg">Nous rendre visite</h3>
              <p className="mt-2 text-sm text-primary-foreground/80">{BRAND.address}</p>
              <MarketingButton
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(BRAND.address)}`}
                variant="secondary"
                size="default"
                className="mt-5"
              >
                Voir sur la carte
              </MarketingButton>
            </div>

            <div className="rounded-3xl bg-muted/50 p-6 sm:p-8">
              <Clock className="size-6 text-accent" />
              <h3 className="mt-4 font-bold text-lg text-primary">Horaires d’ouverture</h3>
              <ul className="mt-4 space-y-3">
                {BRAND.hours.map((h) => (
                  <li key={h.day} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                    <span className="text-muted-foreground">{h.day}</span>
                    <span className="text-right font-medium text-foreground">{h.hours}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}
