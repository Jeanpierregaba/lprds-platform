import { MessageCircle } from 'lucide-react'
import { Reveal } from './reveal'
import { MarketingButton } from './marketing-button'
import { BRAND } from '@/lib/marketing/data'

/** Bandeau de conversion — repris en bas de chaque page (sauf Contact, déjà orienté action). */
export function CtaBand() {
  return (
    <section className="bg-accent px-6 py-16 text-accent-foreground sm:py-20 lg:px-8">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="font-bold text-3xl sm:text-4xl">Prêt à commencer votre parcours ?</h2>
        <p className="mx-auto mt-4 max-w-lg text-muted-foreground sm:text-lg">
          Planifiez une visite de nos locaux et rencontrez notre équipe. Nous répondons à toutes vos questions.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <MarketingButton href="/contact" size="lg" variant="primary">
            Réserver une visite
          </MarketingButton>
          <MarketingButton href={BRAND.whatsapp} size="lg" variant="whatsapp">
            <MessageCircle className="size-5" />
            Discuter sur WhatsApp
          </MarketingButton>
        </div>
      </Reveal>
    </section>
  )
}
