/**
 * Navigation consciente de la locale.
 *
 * ⚠️ RÈGLE ABSOLUE DU PROJET : ne jamais importer `Link` depuis `next/link`,
 * ni `useRouter` / `usePathname` / `redirect` depuis `next/navigation`.
 * Tout passe par ce module. Un import direct de `next/*` compile et fonctionne
 * en apparence — mais perd le préfixe `/en` en silence : un visiteur anglophone
 * retombe en français au premier clic, sans la moindre erreur pour le signaler.
 * C'est le piège numéro un de cette architecture.
 */
import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
