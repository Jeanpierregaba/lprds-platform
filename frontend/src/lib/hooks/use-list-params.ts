'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { useRouter } from '@/i18n/navigation'

/**
 * Filtres d'une liste — **dans l'URL, pas en état local**.
 *
 * ⚠️ Signalé par un établissement : ouvrir la fiche d'un enfant puis revenir en
 * arrière rechargeait la liste à zéro — recherche, département, section,
 * inactifs, page et mode d'affichage perdus. La cause n'est pas la navigation
 * mais l'ÉTAT : des filtres en `useState` ne survivent à AUCUNE navigation, et
 * le cache de React Query n'y change rien puisque la clé de requête est
 * reconstruite depuis des valeurs par défaut.
 *
 * Le remède est celui déjà appliqué aux rapports (cf.
 * `app/[locale]/dashboard/admin/reports/list-params.ts`, qui garde sa propre
 * copie validée pour ses onglets typés) : porter l'état dans la requête. Le
 * retour arrière du navigateur retrouve alors le bon écran sans qu'on écrive
 * une ligne pour lui, le lien devient partageable, et la page de détail peut
 * revenir exactement d'où l'on vient.
 */
export type ListParamValue = string | number | boolean

export type ListParamsShape = Record<string, ListParamValue>

type SearchParamsLike = { get(name: string): string | null }

/** Le TYPE de la valeur par défaut dit comment relire le paramètre : pas de
 *  schéma à tenir à jour en parallèle des défauts. */
function parseParam<T extends ListParamValue>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback
  if (typeof fallback === 'number') {
    const parsed = Number(raw)
    // Un « skip » négatif ou non numérique vient d'une URL bricolée : on
    // retombe sur le défaut plutôt que de demander une page qui n'existe pas.
    return (Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback) as T
  }
  if (typeof fallback === 'boolean') {
    if (raw === 'true') return true as T
    if (raw === 'false') return false as T
    return fallback
  }
  return raw as T
}

export function readListParams<T extends ListParamsShape>(sp: SearchParamsLike, defaults: T): T {
  const params: Record<string, ListParamValue> = { ...defaults }
  for (const [key, fallback] of Object.entries(defaults) as [string, ListParamValue][]) {
    params[key] = parseParam(sp.get(key), fallback)
  }
  return params as T
}

/** Chemin de la liste portant ces filtres — **les valeurs par défaut sont
 *  omises**, pour que l'URL courante reste lisible. */
export function listHref<T extends ListParamsShape>(path: string, defaults: T, params: T): string {
  const sp = new URLSearchParams()
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    if (params[key] === defaults[key]) continue
    sp.set(key, String(params[key]))
  }
  const query = sp.toString()
  return query ? `${path}?${query}` : path
}

/**
 * Où revenir depuis une fiche.
 *
 * ⚠️ `from` vient de la BARRE D'ADRESSE : il est fourni par quiconque fabrique
 * le lien. On n'y obéit que s'il désigne bien CETTE liste — sans cette garde,
 * un lien piégé ferait sortir l'utilisateur du site au moment où il clique
 * « retour ». `startsWith` seul ne suffirait pas : pour `/dashboard/admin/staff`,
 * « /dashboard/admin/staffXYZ » le satisferait.
 */
export function listBackHref(listPath: string, from: string | null | undefined): string {
  if (!from) return listPath
  let decoded: string
  try {
    decoded = decodeURIComponent(from)
  } catch {
    return listPath
  }
  const legitime = decoded === listPath || decoded.startsWith(`${listPath}?`)
  return legitime ? decoded : listPath
}

/** Lien vers une fiche, PORTANT les filtres de la liste — c'est ce qui permet
 *  au « retour » de la fiche de retrouver l'écran exact d'où l'on vient. */
export function itemDetailHref<T extends ListParamsShape>(
  listPath: string,
  defaults: T,
  params: T,
  id: string,
): string {
  return `${listPath}/${id}?from=${encodeURIComponent(listHref(listPath, defaults, params))}`
}

export function useListParams<T extends ListParamsShape>(listPath: string, defaults: T) {
  const searchParams = useSearchParams()
  const router = useRouter()

  const params = useMemo(() => readListParams(searchParams, defaults), [searchParams, defaults])

  const setParams = useCallback(
    (patch: Partial<T>) => {
      // ⚠️ On relit l'URL AU MOMENT du geste, et non les filtres du rendu qui a
      // posé ce gestionnaire. Deux gestes rapprochés — la recherche débouncée
      // qui se valide pendant qu'on bascule un sélecteur — partiraient sinon du
      // même instantané, et le second EFFACERAIT le premier. Observé à l'écran.
      const live =
        typeof window === 'undefined'
          ? params
          : readListParams(new URLSearchParams(window.location.search), defaults)
      // `replace` et non `push` : changer de filtre n'est pas une étape de
      // navigation, et empiler trente entrées rendrait le bouton « retour »
      // inutilisable. `scroll: false` : seule la liste change sous les yeux.
      router.replace(listHref(listPath, defaults, { ...live, ...patch }), { scroll: false })
    },
    [params, defaults, listPath, router],
  )

  /** Un filtre qui change remet la pagination à zéro : rester page 3 d'un
   *  résultat qui n'a plus que deux pages afficherait une liste vide. */
  const setFilter = useCallback(
    (patch: Partial<T>) => setParams({ ...patch, skip: 0 } as Partial<T>),
    [setParams],
  )

  const detailHref = useCallback(
    (id: string) => itemDetailHref(listPath, defaults, params, id),
    [listPath, defaults, params],
  )

  return { params, setParams, setFilter, detailHref }
}

/**
 * Champ de recherche adossé à l'URL.
 *
 * La frappe reste LOCALE — le champ doit répondre à chaque touche — et c'est la
 * valeur débouncée qui part dans la requête, sinon on y écrirait trente fois
 * par mot. L'effet inverse compte autant : quand l'URL change sans passer par
 * le clavier (retour arrière, lien partagé), le champ doit suivre, faute de
 * quoi il afficherait un filtre qui n'est plus appliqué.
 */
export function useUrlSearch(
  value: string,
  commit: (next: string) => void,
  delay = 300,
): [string, (next: string) => void] {
  const [draft, setDraft] = useState(value)
  // Ce que l'URL porte de notre fait : le repère qui distingue « l'utilisateur
  // tape » de « l'URL a changé ailleurs ».
  const committed = useRef(value)
  const commitRef = useRef(commit)
  useEffect(() => { commitRef.current = commit })

  useEffect(() => {
    if (value === committed.current) return
    committed.current = value
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (draft === committed.current) return
    const timer = setTimeout(() => {
      committed.current = draft
      commitRef.current(draft)
    }, delay)
    return () => clearTimeout(timer)
  }, [draft, delay])

  return [draft, setDraft]
}
