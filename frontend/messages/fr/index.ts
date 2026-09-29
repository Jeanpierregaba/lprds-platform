/**
 * Catalogue français — agrégation des domaines.
 *
 * Ajouter un domaine = un fichier JSON + une ligne ici et dans `en/index.ts`.
 * Le type `Messages` est dérivé du français, locale de référence : toute clé
 * manquante côté anglais devient une erreur TypeScript au lieu de se découvrir
 * en production sous la forme d'un libellé brut affiché à l'écran.
 */
import common from './common.json'
import enums from './enums.json'
import errors from './errors.json'
import marketing from './marketing.json'
import nav from './nav.json'
import reports from './reports.json'

export const messages = { common, enums, errors, marketing, nav, reports } as const

export type Messages = typeof messages

export default messages
