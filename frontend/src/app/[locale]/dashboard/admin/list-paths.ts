/**
 * Chemins des listes d'administration — nommés UNE fois.
 *
 * La liste et la fiche en ont tous deux besoin : la liste pour fabriquer ses
 * liens, la fiche pour valider le `from` sur lequel repose son « retour ». Les
 * garder dans un module à part évite que la fiche n'importe la liste entière
 * juste pour une chaîne (le bundle de la fiche embarquerait alors tout l'écran
 * de liste), et évite surtout deux copies qui finiraient par diverger — une
 * divergence que rien ne signalerait : le « retour » retomberait simplement
 * sur une liste remise à zéro.
 */
export const CHILDREN_LIST_PATH = '/dashboard/admin/children'
export const PARENTS_LIST_PATH = '/dashboard/admin/parents'
export const STAFF_LIST_PATH = '/dashboard/admin/staff'
