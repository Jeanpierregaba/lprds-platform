import type { Metadata } from 'next'
import { localeAlternates } from '@/i18n/metadata'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { BRAND } from '@/lib/marketing/data'

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'marketing.privacy.meta' })
  return {
    title: t('title', { name: BRAND.name }),
    alternates: localeAlternates('/confidentialite', locale),
  }
}

export default function PrivacyPolicyPage() {
  const t = useTranslations('marketing.privacy')

  return (
    <article className="mx-auto max-w-2xl px-4 pb-16 pt-24 sm:px-6 sm:pb-24 sm:pt-32 lg:px-8">
      <h1 className="font-display text-2xl text-primary sm:text-3xl">{t('title')}</h1>
      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="font-display text-lg text-foreground">{t('dataTitle')}</h2>
          <p className="mt-2">{t('dataBody', { email: BRAND.email })}</p>
        </section>
        <section>
          <h2 className="font-display text-lg text-foreground">{t('parentTitle')}</h2>
          <p className="mt-2">{t('parentBody')}</p>
        </section>
        <section>
          <h2 className="font-display text-lg text-foreground">{t('contactTitle')}</h2>
          <p className="mt-2">{t('contactBody', { email: BRAND.email, phone: BRAND.phone })}</p>
        </section>
      </div>
    </article>
  )
}
