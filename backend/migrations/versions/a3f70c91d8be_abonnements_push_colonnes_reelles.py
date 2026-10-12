"""Les colonnes d'abonnement push étaient trop courtes pour de vraies clés

⚠️ Ce n'est pas un élargissement de confort : `p256dh` fait 87 caractères
(point de courbe non compressé, 65 octets, en base64url) et la colonne en
acceptait 44. Tout abonnement réel mourait donc en 500 — « value too long for
varchar(44) » — et aucun n'a jamais pu être enregistré depuis la mise en
service.

Le couple (user_id, endpoint) devient unique : un abonnement identifie un
APPAREIL, pas un compte. Sans cette contrainte, deux lignes peuvent décrire le
même navigateur et lui envoyer deux fois chaque notification.

Les lignes existantes sont écartées plutôt que migrées : les seules qui
pouvaient exister sont les fausses souscriptions écrites par l'ancien
`GET /notifications/test` (endpoint factice, clés bricolées), qui n'ont jamais
pu recevoir quoi que ce soit. Un vrai abonnement se reprend d'un geste côté
navigateur.

Revision ID: a3f70c91d8be
Revises: ea688d161f50
Create Date: 2026-10-12

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a3f70c91d8be"
down_revision: Union[str, None] = "ea688d161f50"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Doublons (user_id, endpoint) : la contrainte d'unicité ci-dessous
    # échouerait dessus. Aucun ne peut être utile — cf. le docstring.
    op.execute("DELETE FROM push_subscriptions")

    op.alter_column(
        "push_subscriptions",
        "endpoint",
        existing_type=sa.String(length=500),
        type_=sa.Text(),
        existing_nullable=False,
    )
    op.alter_column(
        "push_subscriptions",
        "p256dh",
        existing_type=sa.String(length=44),
        type_=sa.String(length=128),
        existing_nullable=False,
    )
    op.alter_column(
        "push_subscriptions",
        "auth_key",
        existing_type=sa.String(length=44),
        type_=sa.String(length=32),
        existing_nullable=False,
    )
    op.create_unique_constraint(
        "uq_push_subscription_user_endpoint",
        "push_subscriptions",
        ["user_id", "endpoint"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_push_subscription_user_endpoint",
        "push_subscriptions",
        type_="unique",
    )
    # Le retour en arrière tronquerait des clés valides : on vide plutôt que de
    # fabriquer des abonnements corrompus que rien ne distinguerait des bons.
    op.execute("DELETE FROM push_subscriptions")
    op.alter_column(
        "push_subscriptions",
        "auth_key",
        existing_type=sa.String(length=32),
        type_=sa.String(length=44),
        existing_nullable=False,
    )
    op.alter_column(
        "push_subscriptions",
        "p256dh",
        existing_type=sa.String(length=128),
        type_=sa.String(length=44),
        existing_nullable=False,
    )
    op.alter_column(
        "push_subscriptions",
        "endpoint",
        existing_type=sa.Text(),
        type_=sa.String(length=500),
        existing_nullable=False,
    )
