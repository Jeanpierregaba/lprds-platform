import { MessageCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Reveal } from './reveal'
import { MarketingButton } from './marketing-button'
import { BRAND } from '@/lib/marketing/data'

/** Bandeau de conversion — repris en bas de chaque page (sauf Contact, déjà orienté action). */
export function CtaBand() {
  const t = useTranslations('marketing.cta')

  return (
    <section className="bg-accent px-6 py-16 text-accent-foreground sm:py-20 lg:px-8">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="font-bold text-3xl sm:text-4xl">{t('title')}</h2>
        <p className="mx-auto mt-4 max-w-lg text-muted-foreground sm:text-lg">
          {t('body')}
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <MarketingButton href="/contact" size="lg" variant="primary" className="w-full sm:w-auto">
            {t('visit')}
          </MarketingButton>
          <MarketingButton href={BRAND.whatsapp} size="lg" variant="whatsapp" className="w-full sm:w-auto">
            <MessageCircle className="size-5" />
            {t('whatsapp')}
          </MarketingButton>
        </div>
      </Reveal>
    </section>
  )
}
