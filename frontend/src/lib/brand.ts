/**
 * Le nom de l'établissement — **source unique**.
 *
 * ⚠️ Il en existait TROIS, et elles se contredisaient : le manifeste PWA le
 * lisait dans les catalogues de traduction, le titre du navigateur dans
 * `NEXT_PUBLIC_APP_NAME`, et la barre iOS l'avait en dur. Le passage du
 * manifeste à l'i18n a donc changé le nom de l'application installée sans que
 * personne ne l'ait demandé — les navigateurs ont affiché « Examiner la
 * modification du nom » aux utilisateurs, avec un bouton « Désinstaller ».
 *
 * ⚠️ **Ce n'est PAS une chaîne traduisible** : c'est un nom propre, au même
 * titre que « LPRDS » dans l'ALLOWLIST des gardes de lint. Le mettre dans les
 * catalogues invite exactement à ce qui est arrivé — quelqu'un le « traduit »,
 * et le nom de l'application change.
 *
 * ⚠️ `NEXT_PUBLIC_APP_NAME` n'est plus lu. La variable reste sans effet dans
 * les `.env` existants (contrairement au backend, Next ignore une variable
 * inutilisée). Le jour où un second établissement déploiera la plateforme,
 * c'est ici qu'il faudra décider d'un paramètre — en une seule fois, pas en
 * trois endroits.
 */
export const APP_NAME = 'Les Petits Rayons De Soleil'

/**
 * Étiquette sous l'icône, sur un écran d'accueil.
 *
 * Volontairement courte : les lanceurs tronquent au-delà d'une douzaine de
 * caractères, et « Les Petits Rayons De Soleil » y deviendrait « Les Petits… ».
 */
export const APP_SHORT_NAME = 'LPRDS'
