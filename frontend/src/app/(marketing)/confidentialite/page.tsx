import type { Metadata } from 'next'
import { BRAND } from '@/lib/marketing/data'

export const metadata: Metadata = {
  title: `Politique de confidentialité — ${BRAND.name}`,
}

export default function PrivacyPolicyPage() {
  return (
    <article className="mx-auto max-w-2xl px-4 pb-16 pt-24 sm:px-6 sm:pb-24 sm:pt-32 lg:px-8">
      <h1 className="font-display text-2xl text-primary sm:text-3xl">Politique de confidentialité</h1>
      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="font-display text-lg text-foreground">Données collectées</h2>
          <p className="mt-2">
            Le formulaire de contact de ce site ne transmet aucune donnée à un serveur : il ouvre directement votre
            messagerie avec un message pré-rempli à destination de {BRAND.email}. Aucune information n’est stockée
            par le site vitrine lui-même.
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg text-foreground">Espace Parent</h2>
          <p className="mt-2">
            Les familles inscrites disposent d’un espace personnel sécurisé, régi par les conditions communiquées à
            l’inscription. Les données qui y sont traitées (rapports, présence, messagerie) restent strictement
            réservées au suivi de l’enfant par l’établissement.
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg text-foreground">Contact</h2>
          <p className="mt-2">
            Pour toute question relative à vos données personnelles, contactez-nous à {BRAND.email} ou au{' '}
            {BRAND.phone}.
          </p>
        </section>
      </div>
    </article>
  )
}
