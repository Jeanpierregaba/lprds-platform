'use client'

import { useTranslations } from 'next-intl'
import { Check, Globe, Loader2 } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useLocaleSwitch } from '@/i18n/use-locale-switch'
import { LOCALES } from '@/i18n/routing'
import { cn } from '@/lib/utils/cn'

/**
 * Choix de la langue de l'application, dans les paramètres des quatre espaces.
 *
 * Le bouton de l'en-tête suffisait à CHANGER de langue, mais pas à la
 * RÉGLER — et les deux gestes ne portent pas la même promesse :
 *
 *  - une bascule dans l'en-tête se lit comme « montre-moi cette page en
 *    anglais », le temps d'une visite ;
 *  - un réglage dans les paramètres se lit comme « je suis anglophone »,
 *    durablement, et c'est ce que l'utilisateur vient y chercher.
 *
 * Le geste technique est pourtant le même (`useLocaleSwitch`), et c'est
 * justement ce qui mérite d'être DIT ici plutôt que supposé : ce réglage ne
 * change pas que l'écran, il gouverne aussi les emails, les bulletins PDF et
 * les notifications — tout ce qui part du serveur quand personne n'est devant
 * l'écran, et qui ne peut donc pas lire un cookie de navigateur. Un parent qui
 * ignore ce lien ne comprendrait pas de recevoir un bulletin dans l'autre
 * langue que son interface.
 *
 * ⚠️ Pas de bouton « Enregistrer » : l'enregistrement est l'effet du choix,
 * comme pour le bouton de l'en-tête. Ajouter une validation en deux temps
 * créerait un état intermédiaire — langue affichée différente de la langue
 * cochée — qui n'a aucun sens pour un réglage dont l'effet est précisément
 * d'être immédiatement visible.
 */
export function LanguageSettingsCard() {
  const t = useTranslations('common.locale')
  const { active, switchTo, isPending } = useLocaleSwitch()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="size-4 text-muted-foreground" aria-hidden />
          {t('settingsTitle')}
        </CardTitle>
        <CardDescription>{t('settingsHint')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div role="radiogroup" aria-label={t('label')} className="grid gap-2 sm:grid-cols-2">
          {LOCALES.map((locale) => {
            const isActive = locale === active
            return (
              <button
                key={locale}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => switchTo(locale)}
                disabled={isPending}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted',
                  isPending && 'cursor-not-allowed opacity-60',
                )}
              >
                <span>
                  {/* Nom de la langue DANS cette langue : le seul libellé qu'un
                      locuteur reconnaît à coup sûr depuis l'autre interface. */}
                  <span className="block text-sm font-medium">{t(locale)}</span>
                  <span className="block text-xs uppercase text-muted-foreground">{locale}</span>
                </span>
                {isActive && (
                  isPending
                    ? <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
                    : <Check className="size-4 shrink-0 text-primary" aria-hidden />
                )}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">{t('settingsScope')}</p>
      </CardContent>
    </Card>
  )
}
