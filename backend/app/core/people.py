"""Le nom d'une personne **tel qu'on l'écrit** — source unique côté backend.

L'établissement nomme les gens par leur surnom (« Tata Victoire », « Papa
Anaïs ») : c'est ce qui figure sur les listes, dans les emails et dans les
notifications. L'état civil n'est que le repli, pour les comptes qui n'ont pas
de surnom.

⚠️ La règle vivait en cinq copies, et elles ne disaient pas la même chose :
quatre rendaient le surnom seul, la cinquième lui accolait le nom de famille
(« Tata Victoire Dupont »). Le miroir frontend est `displayName()`
(`lib/utils/display-name.ts`) — les deux doivent rester d'accord, sinon la même
personne porte deux noms selon l'écran qui la montre.

⚠️ Ne s'applique **pas aux enfants** : leur fiche n'a pas de surnom et porte
`first_names` (au pluriel), ce qui rend les deux cas impossibles à confondre.
"""

from __future__ import annotations

from typing import Protocol


class _Nommable(Protocol):
    nickname: str | None
    first_name: str
    last_name: str


def display_name(personne: _Nommable | None) -> str:
    if personne is None:
        return ""
    surnom = (personne.nickname or "").strip()
    if surnom:
        return surnom
    return f"{personne.first_name} {personne.last_name}".strip()
