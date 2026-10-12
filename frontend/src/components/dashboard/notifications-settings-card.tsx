'use client'

import { useTranslations } from 'next-intl'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { usePushSubscription } from '@/lib/push-subscription'

/**
 * Activation des notifications push pour CET appareil, dans les paramètres des
 * quatre espaces (même emplacement que le réglage de langue).
 *
 * ⚠️ **Sans cet écran, le module restait inatteignable.** `usePushSubscription`
 * existait, documenté, exporté — et appelé par rien. Les neuf défauts du
 * backend ont pu vivre depuis la mise en service précisément parce qu'aucune
 * interface ne tentait jamais de s'abonner : il n'y avait personne pour les
 * rencontrer.
 *
 * ⚠️ Le réglage est par APPAREIL, et le texte le dit. C'est contre-intuitif
 * pour quelqu'un qui pense régler « son compte » : un parent qui active les
 * notifications sur son téléphone n'en recevra pas sur son ordinateur, et sans
 * cette phrase il conclurait à une panne. C'est le navigateur qui détient
 * l'abonnement, pas nous.
 *
 * ⚠️ Le bouton d'essai n'est pas un gadget : un abonnement peut être révoqué
 * côté service de push sans que le navigateur en sache rien (site effacé,
 * application réinstallée). Il n'existe aucun moyen de le détecter autrement
 * qu'en envoyant. Le serveur retire alors la ligne morte (410) — l'essai est
 * donc aussi ce qui remet l'affichage d'accord avec la réalité.
 */
export function NotificationsSettingsCard() {
  const t = useTranslations('common.notifications')
  const { isSupported, permission, isSubscribed, isBusy, error, subscribe, unsubscribe, sendTest } =
    usePushSubscription()

  const bloque = permission === 'denied'

  const basculer = async () => {
    if (isSubscribed) {
      if (await unsubscribe()) toast.success(t('disabled'))
      return
    }
    if (await subscribe()) toast.success(t('enabled'))
  }

  const essayer = async () => {
    if (await sendTest()) toast.success(t('testSent'))
    else toast.error(t('testFailed'))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="size-4 text-muted-foreground" aria-hidden />
          {t('settingsTitle')}
        </CardTitle>
        <CardDescription>{t('settingsHint')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isSupported ? (
          <p className="text-sm text-muted-foreground">{t('unsupported')}</p>
        ) : bloque && !isSubscribed ? (
          <>
            <p className="text-sm font-medium">{t('blocked')}</p>
            <p className="text-xs text-muted-foreground">{t('blockedHint')}</p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isSubscribed ? 'default' : 'secondary'}>
                {isSubscribed
                  ? <Bell className="mr-1 size-3" aria-hidden />
                  : <BellOff className="mr-1 size-3" aria-hidden />}
                {isSubscribed ? t('statusEnabled') : t('statusDisabled')}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={isSubscribed ? 'outline' : 'default'}
                onClick={basculer}
                disabled={isBusy}
              >
                {isBusy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
                {isSubscribed ? t('disable') : t('enable')}
              </Button>

              {isSubscribed && (
                <Button type="button" variant="ghost" onClick={essayer} disabled={isBusy}>
                  {t('test')}
                </Button>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">{t('settingsScope')}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
