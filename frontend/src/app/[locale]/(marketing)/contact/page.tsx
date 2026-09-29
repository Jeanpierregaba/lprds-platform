import type { Metadata } from 'next'
import { localeAlternates } from '@/i18n/metadata'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { PageHero } from '@/components/marketing/page-hero'
import { ContactForm } from '@/components/marketing/contact-form'
import { Reveal } from '@/components/marketing/reveal'
import { MarketingButton } from '@/components/marketing/marketing-button'
import { SECTION_PIN_STYLES, SectionPinCard } from '@/components/marketing/section-pin-card'
import { BRAND, buildBrandCopy } from '@/lib/marketing/data'

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'marketing.contact.meta' })
  return {
    title: t('title', { name: BRAND.name }),
    description: t('description'),
    alternates: localeAlternates('/contact', locale),
  }
}

export default function ContactPage() {
  const t = useTranslations('marketing')
  const tContact = useTranslations('marketing.contact')
  const brand = buildBrandCopy(t)

  const quickContacts = [
    { Icon: Phone, label: tContact('quick.phone'), value: BRAND.phone, href: BRAND.phoneHref },
    { Icon: MessageCircle, label: tContact('quick.whatsapp'), value: tContact('quick.whatsappValue'), href: BRAND.whatsapp },
    { Icon: Mail, label: tContact('quick.email'), value: BRAND.email, href: `mailto:${BRAND.email}` },
  ]

  return (
    <>
      <PageHero
        title={tContact('hero.title')}
        subtitle={tContact('hero.subtitle')}
        badge={tContact('hero.badge')}
        Icon={Mail}
        image="/images/marketing/contactPic.png"
      />

      <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-10 sm:grid-cols-3 sm:gap-8">
          {quickContacts.map(({ Icon, label, value, href }, i) => {
            const style = SECTION_PIN_STYLES[i % SECTION_PIN_STYLES.length] as (typeof SECTION_PIN_STYLES)[number]
            return (
              <Reveal key={label} delay={i * 0.06} className={style.offset}>
                <a
                  href={href}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  aria-label={tContact('quick.ariaLabel', { label, value })}
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
            <h2 className="font-bold text-2xl text-secondary">{tContact('form.title')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tContact('form.subtitle')}</p>
            <div className="mt-8">
              <ContactForm />
            </div>
          </Reveal>

          <Reveal delay={0.1} className="space-y-6 lg:col-span-2">
            <div className="rounded-3xl bg-tertiary p-6 text-primary-foreground sm:p-8">
              <MapPin className="size-6 text-secondary" />
              <h3 className="mt-4 font-bold text-lg">{tContact('visit.title')}</h3>
              <p className="mt-2 text-sm text-primary-foreground/80">{brand.address}</p>
              <MarketingButton
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(brand.address)}`}
                variant="secondary"
                size="default"
                className="mt-5"
              >
                {tContact('visit.cta')}
              </MarketingButton>
            </div>

            <div className="rounded-3xl bg-muted/50 p-6 sm:p-8">
              <Clock className="size-6 text-accent" />
              <h3 className="mt-4 font-bold text-lg text-primary">{tContact('hours.title')}</h3>
              <ul className="mt-4 space-y-3">
                {brand.hours.map((h) => (
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
