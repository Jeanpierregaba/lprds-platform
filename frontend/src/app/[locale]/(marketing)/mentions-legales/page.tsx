import type { Metadata } from 'next'
import { localeAlternates } from '@/i18n/metadata'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { BRAND, buildBrandCopy } from '@/lib/marketing/data'

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'marketing.legal.meta' })
  return {
    title: t('title', { name: BRAND.name }),
    alternates: localeAlternates('/mentions-legales', locale),
  }
}

export default function LegalNoticePage() {
  const t = useTranslations('marketing')
  const tLegal = useTranslations('marketing.legal')
  const brand = buildBrandCopy(t)

  return (
    <article className="mx-auto max-w-2xl px-4 pb-16 pt-24 sm:px-6 sm:pb-24 sm:pt-32 lg:px-8">
      <h1 className="font-display text-2xl text-primary sm:text-3xl">{tLegal('title')}</h1>
      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="font-display text-lg text-foreground">{tLegal('publisherTitle')}</h2>
          <p className="mt-2">
            {tLegal('publisherBody', { name: BRAND.name })}<br />
            {brand.address}<br />
            {tLegal('phoneLabel')} : {BRAND.phone}<br />
            {tLegal('emailLabel')} : {BRAND.email}
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg text-foreground">{tLegal('hostingTitle')}</h2>
          <p className="mt-2">{tLegal('hostingBody', { name: BRAND.name })}</p>
        </section>
        <section>
          <h2 className="font-display text-lg text-foreground">{tLegal('ipTitle')}</h2>
          <p className="mt-2">{tLegal('ipBody', { name: BRAND.name })}</p>
        </section>
      </div>
    </article>
  )
}
