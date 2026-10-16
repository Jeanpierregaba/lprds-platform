"""attendance:qrcode + attendance:correct, et clé stable du rôle socle

Revision ID: a7e3c91f4d22
Revises: c5e9a74b0812
Create Date: 2026-10-16 10:00:00.000000

Deux chantiers distincts, une seule révision parce qu'ils touchent les mêmes
lignes de `roles` / `role_permissions` et qu'un ordre partiel laisserait la
base dans un état que personne n'a voulu.

1. `attendance:write` ne désignait pas ce que son libellé annonce. Il couvrait
   les PARAMÈTRES du module (horaires, exemptions, fuseau) mais aussi
   l'impression des badges QR et la rectification d'une heure de pointage —
   deux gestes quotidiens. Conséquence signalée par l'établissement : une
   assistante de direction ne pouvait ni imprimer un badge ni corriger un
   pointage sans recevoir en même temps les réglages de l'établissement.

   ⚠️ Le redécoupage RETIRE des capacités aux rôles existants, en silence :
   un rôle qui portait `attendance:write` perdrait badges et corrections sans
   qu'aucun écran ne l'annonce. Les deux nouvelles permissions sont donc
   ATTRIBUÉES à tout rôle qui porte déjà `attendance:write` — ce rôle les
   exerçait déjà, on ne fait que nommer ce qu'il faisait.

2. Le rôle socle (éducatrice, bibliothécaire) était retrouvé PAR SON NOM, que
   l'admin peut éditer depuis l'écran Rôles. Renommé, le socle était recréé en
   double à la prochaine embauche, et une rétrogradation retirait le mauvais
   lien — le membre gardait ses droits. Même défaut que le seed identifié par
   email, déjà corrigé ailleurs : on le remplace par une clé qu'aucune
   interface n'expose.
"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7e3c91f4d22'
down_revision: Union[str, None] = 'c5e9a74b0812'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_NEW_PERMISSIONS = [
    ("attendance:qrcode", "Générer et imprimer les badges QR de présence"),
    (
        "attendance:correct",
        "Rectifier un pointage (saisie manuelle, correction d'heure) et "
        "interroger les parents des absents",
    ),
]

# Noms historiques des rôles socles — ils ont servi de clé jusqu'ici, c'est
# donc par eux qu'il faut retrouver les lignes à marquer. Après cette
# migration ils ne sont plus qu'un libellé, librement renommable.
_BASELINE_NAMES = {
    "Éducatrice (socle)": "educatrice",
    "Bibliothécaire (socle)": "bibliothecaire",
}


def upgrade() -> None:
    # ── 1. Catalogue ────────────────────────────────────────────
    op.bulk_insert(
        sa.table(
            "permissions",
            sa.column("id", sa.dialects.postgresql.UUID(as_uuid=True)),
            sa.column("code", sa.String),
            sa.column("label", sa.String),
        ),
        [{"id": uuid.uuid4(), "code": code, "label": label}
         for code, label in _NEW_PERMISSIONS],
    )

    # Reprise : tout rôle portant `attendance:write` reçoit les deux gestes
    # qu'il exerçait déjà. `ON CONFLICT DO NOTHING` parce qu'une base où la
    # migration a été rejouée ne doit pas tomber en doublon.
    op.execute(
        """
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT rp.role_id, np.id
        FROM role_permissions rp
        JOIN permissions wp ON wp.id = rp.permission_id
                           AND wp.code = 'attendance:write'
        JOIN permissions np ON np.code IN ('attendance:qrcode', 'attendance:correct')
        ON CONFLICT DO NOTHING
        """
    )

    # Le libellé d'`attendance:write` mentionnait déjà « horaires, exemptions » ;
    # il nomme désormais aussi le fuseau, et ne promet plus les QR.
    op.execute(
        """
        UPDATE permissions
        SET label = 'Configurer les paramètres de présence (horaires, exemptions, fuseau)'
        WHERE code = 'attendance:write'
        """
    )

    # ── 2. Clé stable du rôle socle ─────────────────────────────
    op.add_column("roles", sa.Column("baseline_kind", sa.String(32), nullable=True))

    for name, kind in _BASELINE_NAMES.items():
        op.execute(
            sa.text(
                "UPDATE roles SET baseline_kind = :kind WHERE name = :name"
            ).bindparams(kind=kind, name=name)
        )

    # Un seul socle de chaque sorte par établissement — et c'est un index
    # PARTIEL : la colonne est NULL pour l'immense majorité des rôles, qu'une
    # contrainte pleine rendrait mutuellement exclusifs.
    op.create_index(
        "uq_role_baseline_kind_per_estab",
        "roles",
        ["establishment_id", "baseline_kind"],
        unique=True,
        postgresql_where=sa.text("baseline_kind IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_role_baseline_kind_per_estab", table_name="roles")
    op.drop_column("roles", "baseline_kind")

    op.execute(
        """
        DELETE FROM role_permissions
        WHERE permission_id IN (
            SELECT id FROM permissions
            WHERE code IN ('attendance:qrcode', 'attendance:correct')
        )
        """
    )
    op.execute(
        """
        DELETE FROM permissions
        WHERE code IN ('attendance:qrcode', 'attendance:correct')
        """
    )
    op.execute(
        """
        UPDATE permissions
        SET label = 'Configurer les paramètres de présence (horaires, exemptions)'
        WHERE code = 'attendance:write'
        """
    )
