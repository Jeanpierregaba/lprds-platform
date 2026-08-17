"""
Le compte staff n'est pas un modèle à part : c'est un User (role=staff), déjà
porteur des colonnes `matricule` et `staff_type`. Ce module ne définit que le
vocabulaire des types de personnel.

⚠️ `StaffType` est une métadonnée DESCRIPTIVE (le poste). Il est totalement
indépendant de :
  • UserRole  → le type de compte (le staff reste role=staff)
  • RBAC      → les droits effectifs viennent des rôles/permissions attribués
Choisir « administrateur » comme type ne confère AUCUN droit d'administration.
"""

from enum import StrEnum


class StaffType(StrEnum):
    ADMINISTRATEUR = "administrateur"
    EDUCATEUR      = "educateur"        # Éducatrice / éducateur
    PRESTATAIRE    = "prestataire"
    DIRECTRICE     = "directrice"
    REDACTEUR      = "redacteur"        # Rédaction/publication du blog (module Blog)
    SECRETAIRE     = "secretaire"
    RESTAURATEUR   = "restaurateur"
