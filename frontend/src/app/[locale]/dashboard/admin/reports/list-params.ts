'use client'

import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'

import { useRouter } from '@/i18n/navigation'
import type { ViewMode } from '@/components/dashboard/shared/filters'
import { REPORT_STATUSES, REPORT_TYPES, type ReportStatus, type ReportType } from '@/types/reports'

export const REPORTS_LIST_PATH = '/dashboard/admin/reports'

export type StatusTab = ReportStatus | 'missing'

export type ReportListParams = {
  /** Onglet de type — l'écran en a trois. */
  type: ReportType
  /** Pastille de statut dans l'onglet — les cinq, « Non soumis » incluse. */
  status: StatusTab
  /** Recherche par nom, prénoms ou matricule. */
  q: string
  /**
   * Date de la pastille « Non soumis », qui porte son PROPRE sélecteur.
   * Vide = aujourd'hui : figer la date du jour dans la valeur par défaut la
   * graverait dans tous les liens fabriqués ce jour-là, et un lien ouvert le
   * lendemain afficherait la veille sans que personne ne l'ait demandé.
   */
  date: string
  /** Page courante (décalage), pour les quatre pastilles paginées. */
  skip: number
  /** Cartes ou tableau. */
  view: ViewMode
}

const DEFAULTS: ReportListParams = {
  type: 'quotidien',
  status: 'submitted',
  q: '',
  date: '',
  skip: 0,
  view: 'cards',
}

const isType = (v: string | null): v is ReportType =>
  v !== null && (REPORT_TYPES as readonly string[]).includes(v)
const isStatus = (v: string | null): v is StatusTab =>
  v !== null && ((REPORT_STATUSES as readonly string[]).includes(v) || v === 'missing')

/** Lit les filtres de la liste depuis l'URL, avec les valeurs par défaut. */
export function readReportListParams(sp: URLSearchParams | ReadonlyURLSearchParamsLike): ReportListParams {
  const type = sp.get('type')
  const status = sp.get('status')
  const skip = Number(sp.get('skip'))
  const view = sp.get('view')
  return {
    type: isType(type) ? type : DEFAULTS.type,
    status: isStatus(status) ? status : DEFAULTS.status,
    q: sp.get('q') ?? DEFAULTS.q,
    date: isIsoDate(sp.get('date')) ? (sp.get('date') as string) : DEFAULTS.date,
    // Un décalage négatif ou non numérique vient d'une URL bricolée : on
    // retombe sur la première page plutôt que de demander ce qui n'existe pas.
    skip: Number.isInteger(skip) && skip >= 0 ? skip : DEFAULTS.skip,
    view: view === 'table' || view === 'cards' ? view : DEFAULTS.view,
  }
}

const isIsoDate = (v: string | null): boolean =>
  v !== null && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))

type ReadonlyURLSearchParamsLike = { get(name: string): string | null }

/** Chemin de la liste portant ces filtres — les valeurs par défaut sont
 *  omises, pour que l'URL courante reste lisible. */
export function reportListHref(params: ReportListParams): string {
  const sp = new URLSearchParams()
  if (params.type !== DEFAULTS.type) sp.set('type', params.type)
  if (params.status !== DEFAULTS.status) sp.set('status', params.status)
  if (params.q) sp.set('q', params.q)
  if (params.date) sp.set('date', params.date)
  if (params.skip !== DEFAULTS.skip) sp.set('skip', String(params.skip))
  if (params.view !== DEFAULTS.view) sp.set('view', params.view)
  const query = sp.toString()
  return query ? `${REPORTS_LIST_PATH}?${query}` : REPORTS_LIST_PATH
}

/**
 * Où revenir depuis le détail d'un rapport.
 *
 * ⚠️ `from` vient de la BARRE D'ADRESSE : il est fourni par qui que ce soit qui
 * fabrique le lien. On n'y obéit que s'il désigne bien la liste des rapports —
 * sans cette garde, un lien piégé ferait sortir l'utilisateur du site au
 * moment où il clique « retour », juste après avoir validé quelque chose.
 * `startsWith` seul ne suffirait pas : « /dashboard/admin/reportsXYZ » le
 * satisferait.
 */
export function reportsBackHref(from: string | null | undefined): string {
  if (!from) return REPORTS_LIST_PATH
  let decoded: string
  try {
    decoded = decodeURIComponent(from)
  } catch {
    return REPORTS_LIST_PATH
  }
  const legitime = decoded === REPORTS_LIST_PATH || decoded.startsWith(`${REPORTS_LIST_PATH}?`)
  return legitime ? decoded : REPORTS_LIST_PATH
}

/**
 * Lien vers le détail d'un rapport, PORTANT les filtres de la liste.
 *
 * C'est ce qui permet au détail de revenir exactement d'où l'on vient après une
 * validation — sans ces paramètres il ne peut que deviner, et il devinait
 * « Quotidien / Soumis ». Un lien reçu de l'extérieur n'en a pas et retombe
 * naturellement sur les valeurs par défaut.
 */
export function reportDetailHref(reportId: string, params: ReportListParams): string {
  return `${REPORTS_LIST_PATH}/${reportId}?from=${encodeURIComponent(reportListHref(params))}`
}

/**
 * Filtres de la liste des rapports — **dans l'URL, pas en état local**.
 *
 * ⚠️ Signalé par un établissement : après avoir validé un rapport bi-mensuel,
 * l'admin était renvoyé à la racine de la liste, qui rouvre l'onglet
 * « Quotidien ». Il devait donc re-naviguer à CHAQUE validation — et il en
 * enchaîne des dizaines. Les onglets vivaient en `useState`, donc rien ne
 * survivait à la navigation : ni le type, ni la pastille de statut, ni la
 * recherche.
 *
 * Porter l'état dans l'URL règle les trois d'un coup : la page de détail n'a
 * qu'à recopier la requête pour revenir exactement d'où l'on vient, le lien
 * est partageable, et le retour arrière du navigateur retrouve le bon écran.
 *
 * `replace` et non `push` : changer d'onglet n'est pas une étape de
 * navigation, et empiler trente entrées d'historique rendrait le bouton
 * « retour » inutilisable.
 */
export function useReportListParams() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const params = useMemo(() => readReportListParams(searchParams), [searchParams])

  const setParams = useCallback(
    (patch: Partial<ReportListParams>) => {
      // ⚠️ On relit l'URL AU MOMENT du geste : la recherche débouncée qui se
      // valide pendant qu'on change de pastille partirait sinon du même
      // instantané que le clic, et l'une des deux effacerait l'autre.
      const live =
        typeof window === 'undefined'
          ? params
          : readReportListParams(new URLSearchParams(window.location.search))
      // `scroll: false` : on reste où on est, seul l'onglet change sous les yeux.
      router.replace(reportListHref({ ...live, ...patch }), { scroll: false })
    },
    [params, router],
  )

  /** Un filtre qui change remet la pagination à zéro : rester page 3 d'un
   *  résultat qui n'en a plus que deux afficherait une liste vide. */
  const setFilter = useCallback(
    (patch: Partial<ReportListParams>) => setParams({ ...patch, skip: 0 }),
    [setParams],
  )

  return { params, setParams, setFilter }
}
