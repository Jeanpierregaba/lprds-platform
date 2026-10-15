/**
 * Le nom d'une personne **à l'écran** — source unique.
 *
 * L'établissement nomme les gens par leur surnom (« Tata Victoire »,
 * « Papa Anaïs ») : c'est ce qui figure sur les listes, les badges et dans la
 * bouche de tout le monde. L'état civil n'est que le repli, pour les comptes
 * qui n'ont pas de surnom.
 *
 * ⚠️ La règle était recopiée dans une vingtaine d'écrans, et une poignée
 * l'avait simplement OUBLIÉE — journal de présence, filtres de galerie,
 * attribution des rôles, liste des admins, en-tête, profil. Rien ne le
 * signalait : un nom s'affiche, il est juste le mauvais.
 *
 * ⚠️ Ne s'applique **pas aux enfants** : leur fiche n'a pas de surnom et porte
 * `first_names` (au pluriel), ce qui rend les deux cas impossibles à
 * confondre à l'appel.
 */
export function displayName(
  personne: { nickname?: string | null; first_name?: string | null; last_name?: string | null } | null | undefined,
): string {
  if (!personne) return ''
  const surnom = personne.nickname?.trim()
  if (surnom) return surnom
  return [personne.first_name, personne.last_name].filter(Boolean).join(' ').trim()
}

/**
 * Initiales pour un avatar, dérivées du même nom que celui qui est affiché.
 *
 * Les tirer de l'état civil pendant que l'écran affiche le surnom donnerait
 * « JD » à côté de « Tata Victoire ».
 */
export function displayInitials(
  personne: { nickname?: string | null; first_name?: string | null; last_name?: string | null } | null | undefined,
): string {
  const mots = displayName(personne).split(/\s+/).filter(Boolean)
  if (mots.length === 0) return '?'
  const premieres = mots.slice(0, 2).map((m) => m[0]?.toUpperCase() ?? '')
  return premieres.join('') || '?'
}
