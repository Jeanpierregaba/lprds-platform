"""
Annuaire — ce qu'un SÉLECTEUR exige, et rien de plus.

⚠️ Le point de ce module est ce qu'il n'expose PAS. Neuf écrans allaient
chercher la liste des enfants ou du personnel dans le module d'à côté pour
remplir une liste déroulante : l'onglet des badges QR téléchargeait la fiche
COMPLÈTE de l'enfant — notes médicales, médications, médecin traitant — pour
imprimer un nom sur une carte. Et comme ces appels exigent `children:read`,
une assistante de direction ne pouvait pas imprimer un badge sans recevoir
l'accès au dossier médical de tous les enfants.

Un sélecteur a besoin d'un nom, d'un matricule et d'un rattachement. C'est
tout ce qui sort d'ici.
"""
import uuid

from pydantic import BaseModel


class DirectoryChild(BaseModel):
    id:           uuid.UUID
    display_name: str
    # ⚠️ Les deux composantes du nom EN PLUS du nom affichable : le badge
    # physique imprime les prénoms et le nom sur deux lignes distinctes, à des
    # positions et dans des couleurs différentes (`card-generator.ts`). Les
    # recoller en une seule chaîne changerait la carte imprimée.
    first_names:  str
    last_name:    str
    matricule:    str
    # Le RATTACHEMENT, parce qu'un sélecteur en a presque toujours besoin
    # ensuite : le formulaire de rapport interroge les types actifs du
    # département de l'enfant, les filtres raisonnent par section.
    department_id:   uuid.UUID | None
    department_name: str | None
    section_id:      uuid.UUID | None
    section_name:    str | None
    is_active:    bool
    # Un BOOLÉEN, pas une URL : l'image passe par un endpoint authentifié.
    # Sans ce drapeau, chaque case de liste lancerait un appel voué à la 404.
    has_photo:    bool


class DirectoryStaff(BaseModel):
    id:           uuid.UUID
    display_name: str
    matricule:    str | None
    staff_type:   str | None
    is_active:    bool


class DirectoryUnit(BaseModel):
    """
    Une unité de la hiérarchie — département, section ou groupe.

    Le rattachement est porté par le champ du NIVEAU SUPÉRIEUR : un département
    n'en a aucun, une section porte `department_id`, un groupe `section_id`.
    Un `parent_id` unique aurait été plus court et illisible à l'usage — il
    faudrait savoir à quelle liste on parle pour l'interpréter.
    """

    id:            uuid.UUID
    name:          str
    department_id: uuid.UUID | None = None
    section_id:    uuid.UUID | None = None
    is_active:     bool = True


class DirectoryChildrenResponse(BaseModel):
    total: int
    items: list[DirectoryChild]


class DirectoryStaffResponse(BaseModel):
    total: int
    items: list[DirectoryStaff]


class DirectoryUnitsResponse(BaseModel):
    departments: list[DirectoryUnit]
    sections:    list[DirectoryUnit]
    groups:      list[DirectoryUnit]
