/**
 * Catalogue français — agrégation des domaines.
 *
 * Ajouter un domaine = un fichier JSON + une ligne ici et dans `en/index.ts`.
 * Le type `Messages` est dérivé du français, locale de référence : toute clé
 * manquante côté anglais devient une erreur TypeScript au lieu de se découvrir
 * en production sous la forme d'un libellé brut affiché à l'écran.
 */
import attendance from './attendance.json'
import auth from './auth.json'
import children from './children.json'
import common from './common.json'
import enums from './enums.json'
import errors from './errors.json'
import marketing from './marketing.json'
import nav from './nav.json'
import parents from './parents.json'
import reports from './reports.json'

export const messages = { attendance, auth, children, common, enums, errors, marketing, nav, parents, reports } as const

export type Messages = typeof messages

export default messages
