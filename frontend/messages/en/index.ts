/**
 * Catalogue anglais — même découpage que le français.
 *
 * L'annotation `satisfies Messages` est le filet de sécurité du projet : elle
 * casse la compilation dès qu'une clé présente en français manque ici. Sans
 * elle, une clé oubliée ne se verrait qu'à l'exécution, sous la forme du chemin
 * de la clé affiché tel quel à l'utilisateur.
 */
import type { Messages } from '../fr'

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
import staff from './staff.json'

export const messages = { attendance, auth, children, common, enums, errors, marketing, nav, parents, reports, staff } satisfies Messages

export default messages
