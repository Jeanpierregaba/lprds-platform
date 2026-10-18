/**
 * Annuaire — ce qu'un sélecteur exige, et rien de plus.
 *
 * ⚠️ Ces types sont volontairement PAUVRES. Neuf écrans remplissaient leurs
 * listes déroulantes en appelant le module d'à côté (`/children`, `/staff`,
 * `/departments`), ce qui exigeait la permission de CE module : une assistante
 * de direction chargée des présences ne pouvait pas imprimer un badge, faute
 * de `children:read`. Et l'onglet QR téléchargeait la fiche complète de
 * l'enfant — dossier médical compris — pour imprimer un nom sur une carte.
 *
 * Un champ ajouté ici le serait pour tous les porteurs de toutes les
 * permissions listées dans `app/modules/directory/router.py`. C'est le genre
 * d'ajout qui se décide, pas qui se glisse.
 */
export interface DirectoryChild {
  id:           string
  display_name: string
  /** ⚠️ Séparés EN PLUS du nom affichable : le badge physique imprime les
   *  prénoms et le nom sur deux lignes, à des positions et dans des couleurs
   *  différentes (`card-generator.ts`). */
  first_names:  string
  last_name:    string
  matricule:    string
  /** Le rattachement : un sélecteur en a presque toujours besoin ensuite — le
   *  formulaire de rapport interroge les types actifs du département. */
  department_id:   string | null
  department_name: string | null
  section_id:      string | null
  section_name:    string | null
  is_active:    boolean
  has_photo:    boolean
}

export interface DirectoryStaff {
  id:           string
  display_name: string
  matricule:    string | null
  staff_type:   string | null
  is_active:    boolean
}

/**
 * Une unité de la hiérarchie — département, section ou groupe.
 *
 * Le rattachement est porté par le champ du NIVEAU SUPÉRIEUR : un département
 * n'en a aucun, une section porte `department_id`, un groupe `section_id`.
 */
export interface DirectoryUnit {
  id:            string
  name:          string
  department_id: string | null
  section_id:    string | null
  is_active:     boolean
}

export interface DirectoryChildrenResponse {
  total: number
  items: DirectoryChild[]
}

export interface DirectoryStaffResponse {
  total: number
  items: DirectoryStaff[]
}

export interface DirectoryUnitsResponse {
  departments: DirectoryUnit[]
  sections:    DirectoryUnit[]
  groups:      DirectoryUnit[]
}
