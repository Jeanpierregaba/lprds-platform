'use client'

import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs } from '@/components/ui/tabs'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { messagingApi } from '@/lib/api/messaging.api'
import { intlLocale } from '@/lib/utils/locale-format'
import type { AnnouncementRecipient } from '@/types/messaging'
import { displayName } from '@/lib/utils/display-name'

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * Registre d'une diffusion : toute l'audience, filtrable par état.
 *
 * ⚠️ Les trois onglets PARTITIONNENT l'audience — « Lu » veut dire lu ET non
 * signé. Sans cela leurs compteurs ne feraient pas le total, et un signataire
 * apparaîtrait deux fois. Les ratios globaux (« X/Y ont lu ») restent affichés
 * au-dessus, eux cumulent.
 *
 * ⚠️ L'onglet ouvert par défaut est « Rien » : c'est la seule liste qui appelle
 * une action. Les deux autres constatent, celle-là désigne qui relancer.
 *
 * Chargé à l'OUVERTURE seulement (`enabled: open`) : c'est une liste
 * nominative, inutile de la rapatrier pour chaque diffusion affichée.
 */
export function AnnouncementRecipientsDialog({
  announcementId,
  open,
  onOpenChange,
}: {
  announcementId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('messaging')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['messaging', 'announcements', announcementId, 'recipients'],
    queryFn: () => messagingApi.listAnnouncementRecipients(announcementId).then((r) => r.data),
    enabled: open,
  })

  const items = data?.items ?? []
  const nothing = items.filter((r) => !r.read_at && !r.signed_at)
  const read = items.filter((r) => r.read_at && !r.signed_at)
  const signed = items.filter((r) => r.signed_at)
  // L'onglet des signatures n'a de sens que si on en a demandé — ou s'il en
  // reste d'une période où le drapeau était posé (on n'efface jamais une
  // attestation, cf. service).
  const showSigned = (data?.requires_signature ?? false) || signed.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('announcements.registerTitle')}</DialogTitle>
          <DialogDescription>{t('announcements.registerHint')}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">{t('announcements.registerLoadError')}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('announcements.registerEmpty')}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline" className="font-normal">
                {t('announcements.readRatio', { read: data?.read_count ?? 0, total: data?.total ?? 0 })}
              </Badge>
              {data?.requires_signature && (
                <Badge variant="outline" className="font-normal">
                  {t('announcements.signatureRatio', {
                    signed: data?.signature_count ?? 0, total: data?.total ?? 0,
                  })}
                </Badge>
              )}
            </div>

            {/* ⚠️ `min-w-0` indispensable : `DialogContent` est une GRILLE, et
                la piste se dimensionne sur le plus grand `min-content` de ses
                enfants. Les pastilles d'onglets sont insécables, donc sans ce
                `min-w-0` elles élargissent la piste — et c'est TOUT le contenu
                du dialogue qui déborde avec elles (mesuré à 375 px : 402 px de
                contenu dans un dialogue de 343, description et dates coupées).
                La liste d'onglets, elle, défile déjà horizontalement. */}
            <Tabs defaultValue="nothing" className="min-w-0">
              <PillsTabsList fit={false}>
                {/* Pas d'icône sur ces trois pastilles : à 375 px, les trois
                    ensemble dépassaient la largeur du dialogue et la dernière
                    se retrouvait hors champ, derrière un défilement horizontal
                    que rien n'annonce. Le libellé et le compteur suffisent, la
                    couleur active fait le reste. */}
                <PillsTrigger value="nothing" active="orange">
                  {t('announcements.stateNothing')} ({nothing.length})
                </PillsTrigger>
                <PillsTrigger value="read" active="sky">
                  {t('announcements.stateRead')} ({read.length})
                </PillsTrigger>
                {showSigned && (
                  <PillsTrigger value="signed" active="primary">
                    {t('announcements.stateSigned')} ({signed.length})
                  </PillsTrigger>
                )}
              </PillsTabsList>

              <TabPanel value="nothing"><RecipientList items={nothing} /></TabPanel>
              <TabPanel value="read"><RecipientList items={read} /></TabPanel>
              {showSigned && <TabPanel value="signed"><RecipientList items={signed} /></TabPanel>}
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RecipientList({ items }: { items: AnnouncementRecipient[] }) {
  const t = useTranslations('messaging')

  if (items.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">{t('announcements.registerEmptyState')}</p>
  }
  return (
    <ul className="divide-y">
      {items.map((r) => <RecipientRow key={r.parent.id} recipient={r} />)}
    </ul>
  )
}

function RecipientRow({ recipient }: { recipient: AnnouncementRecipient }) {
  const t = useTranslations('messaging')
  const { parent, email, read_at, signed_at, signed_name } = recipient
  const name = displayName(parent)

  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="break-words text-sm font-medium">{name}</p>
        <p className="break-all text-xs text-muted-foreground">{email}</p>
        {signed_at && signed_name && (
          // Le nom TAPÉ, pas celui du compte : un écart doit se voir — l'admin
          // est seul à pouvoir juger si « Mme Koffi » signe pour « Awa Koffi ».
          <p className="break-words text-xs text-muted-foreground">
            {t('announcements.signedAs', { name: signed_name })}
          </p>
        )}
      </div>
      <p className="shrink-0 text-right text-xs text-muted-foreground">
        {signed_at ? formatDateTime(signed_at) : read_at ? formatDateTime(read_at) : null}
      </p>
    </li>
  )
}
