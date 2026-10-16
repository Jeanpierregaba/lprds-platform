'use client'

import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { Printer } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BackLink, PageMotion } from '@/components/dashboard/shared/page'
import { ChildAvatar } from '@/components/children/child-avatar'
import { childrenApi } from '@/lib/api/children.api'
import { useDirectoryUnits } from '@/lib/hooks/use-directory'
import { useRouter } from '@/i18n/navigation'

const PATH = '/dashboard/admin/children/trombinoscope'

/**
 * Trombinoscope d'une SECTION — une grille de photos, faite pour être imprimée.
 *
 * Demandé par un établissement, en même temps que les photos de profil :
 * « une photo récente, un trombinoscope pour chaque classe ». Par section
 * seulement pour l'instant, sur décision explicite.
 *
 * ⚠️ La section vit dans l'URL, pas en état local : une feuille imprimée se
 * rejoue, se partage et se met en favori. Un sélecteur purement local obligerait
 * à re-choisir la section à chaque retour.
 */
export default function TrombinoscopePage() {
  const t = useTranslations('children')
  const router = useRouter()
  const sectionId = useSearchParams().get('section') ?? ''

  // Annuaire : `/sections` exige `organization:read`, que `children:read`
  // n'implique pas — le sélecteur restait vide et la feuille inutilisable.
  const { sections: sectionList } = useDirectoryUnits()
  const sections = { data: sectionList }

  const children = useQuery({
    queryKey: ['children', 'trombinoscope', sectionId],
    queryFn: () =>
      childrenApi.list({ section_id: sectionId, limit: 200 }).then((r) => r.data),
    enabled: sectionId !== '',
  })

  const section = sections.data?.find((s) => s.id === sectionId)
  const items = children.data?.items ?? []
  /* ⚠️ `items` sur le `Select` : sans cette table valeur → libellé, le
     déclencheur affiche l'IDENTIFIANT brut de la section au lieu de son nom.
     C'est le patron des autres sélecteurs du projet (cf. gallery-filters). */
  const sectionItems = Object.fromEntries((sections.data ?? []).map((s) => [s.id, s.name]))

  return (
    <PageMotion className="space-y-4">
      <div className="print:hidden">
        <BackLink href="/dashboard/admin/children" label={t('form.back')} />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">{t('trombinoscope.title')}</h1>
          <p className="text-muted-foreground">{t('trombinoscope.description')}</p>
        </div>

        <div className="flex items-end gap-2">
          <Select
            items={sectionItems}
            value={sectionId}
            onValueChange={(v) => v && router.replace(`${PATH}?section=${v}`)}
          >
            <SelectTrigger className="w-56">
              {/* ⚠️ Le libellé est rendu EXPLICITEMENT : la liste des sections
                  arrive après le premier rendu, et sans ça le déclencheur
                  affiche l'identifiant brut de la section. */}
              <SelectValue placeholder={t('trombinoscope.chooseSection')}>
                {section?.name ?? t('trombinoscope.chooseSection')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(sections.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={items.length === 0}
            onClick={() => window.print()}
          >
            <Printer className="mr-1.5 size-4" />
            {t('trombinoscope.print')}
          </Button>
        </div>
      </div>

      {!sectionId ? (
        <p className="rounded-xl bg-card p-6 text-muted-foreground print:hidden">
          {t('trombinoscope.chooseSection')}
        </p>
      ) : (
        <div className="rounded-xl bg-card p-6 print:rounded-none print:bg-white print:p-0">
          {/* En-tête de la FEUILLE : visible seulement à l'impression, pour que
              la page sortie de l'imprimante se suffise à elle-même. */}
          <div className="mb-4 hidden items-baseline justify-between print:flex">
            <h2 className="text-xl font-bold">{section?.name}</h2>
            <span className="text-sm">{t('trombinoscope.count', { count: items.length })}</span>
          </div>

          {children.isLoading ? (
            <p className="text-muted-foreground">{t('trombinoscope.loading')}</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground">{t('trombinoscope.empty')}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 print:grid-cols-4 print:gap-3">
              {items.map((child) => (
                <li
                  key={child.id}
                  // `break-inside-avoid` : sans lui, une photo se coupe en deux
                  // au saut de page et la feuille devient inutilisable.
                  className="flex break-inside-avoid flex-col items-center gap-2 rounded-lg p-2 text-center print:border print:border-neutral-300"
                >
                  <ChildAvatar
                    childId={child.id}
                    firstNames={child.first_names}
                    lastName={child.last_name}
                    hasPhoto={child.has_photo}
                    size="xl"
                    className="rounded-xl"
                  />
                  <span className="text-sm font-medium leading-tight">
                    {child.first_names}
                  </span>
                  <span className="text-xs leading-tight text-muted-foreground print:text-neutral-600">
                    {child.last_name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </PageMotion>
  )
}
