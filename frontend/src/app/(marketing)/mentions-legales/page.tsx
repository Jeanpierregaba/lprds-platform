import type { Metadata } from 'next'
import { BRAND } from '@/lib/marketing/data'

export const metadata: Metadata = {
  title: `Mentions légales — ${BRAND.name}`,
}

export default function LegalNoticePage() {
  return (
    <article className="mx-auto max-w-2xl px-6 pb-24 pt-32 sm:pt-40 lg:px-8">
      <h1 className="font-display text-3xl text-primary">Mentions légales</h1>
      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="font-display text-lg text-foreground">Éditeur du site</h2>
          <p className="mt-2">
            {BRAND.name}, crèche, garderie et école maternelle.<br />
            {BRAND.address}<br />
            Téléphone : {BRAND.phone}<br />
            Email : {BRAND.email}
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg text-foreground">Hébergement</h2>
          <p className="mt-2">Ce site est hébergé et exploité dans le cadre de la plateforme de gestion {BRAND.name}.</p>
        </section>
        <section>
          <h2 className="font-display text-lg text-foreground">Propriété intellectuelle</h2>
          <p className="mt-2">
            L’ensemble des contenus (textes, images, logo) présents sur ce site est la propriété de {BRAND.name},
            sauf mention contraire, et ne peut être reproduit sans autorisation préalable.
          </p>
        </section>
      </div>
    </article>
  )
}
