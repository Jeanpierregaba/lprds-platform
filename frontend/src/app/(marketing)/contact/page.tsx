import type { Metadata } from 'next'
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { PageHero } from '@/components/marketing/page-hero'
import { ContactForm } from '@/components/marketing/contact-form'
import { Reveal } from '@/components/marketing/reveal'
import { MarketingButton } from '@/components/marketing/marketing-button'
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
        image="/images/marketing/contactPic.jpg"
      />

      <section className="px-6 py-16 sm:py-20 lg:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 sm:grid-cols-3">
          {QUICK_CONTACTS.map(({ Icon, label, value, href }, i) => (
            <Reveal key={label} delay={i * 0.06}>
              <a
                href={href}
                target={href.startsWith('http') ? '_blank' : undefined}
                rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="flex h-full flex-col items-center gap-2 rounded-3xl bg-muted/50 p-6 text-center transition-colors hover:bg-muted"
              >
                <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="font-medium text-primary">{value}</p>
              </a>
            </Reveal>
          ))}
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-10 lg:grid-cols-5">
          <Reveal className="rounded-3xl bg-background p-6 shadow-sm ring-1 ring-border sm:p-10 lg:col-span-3">
            <h2 className="font-display text-2xl text-primary">Envoyez-nous un message</h2>
            <p className="mt-1 text-sm text-muted-foreground">Nous répondons généralement sous 24 à 48h ouvrées.</p>
            <div className="mt-8">
              <ContactForm />
            </div>
          </Reveal>

          <Reveal delay={0.1} className="space-y-6 lg:col-span-2">
            <div className="rounded-3xl bg-primary p-8 text-primary-foreground">
              <MapPin className="size-6 text-secondary" />
              <h3 className="mt-4 font-display text-lg">Nous rendre visite</h3>
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

            <div className="rounded-3xl bg-muted/50 p-8">
              <Clock className="size-6 text-accent" />
              <h3 className="mt-4 font-display text-lg text-primary">Horaires d’ouverture</h3>
              <ul className="mt-4 space-y-3">
                {BRAND.hours.map((h) => (
                  <li key={h.day} className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">{h.day}</span>
                    <span className="font-medium text-foreground">{h.hours}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 rounded-xl bg-accent/10 p-3 text-sm">
                <span className="font-semibold text-accent">Urgence : </span>
                <a href={BRAND.phoneHref} className="text-foreground hover:underline">{BRAND.phone}</a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}
