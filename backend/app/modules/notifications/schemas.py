"""Schémas d'entrée/sortie des abonnements push.

⚠️ **Les longueurs étaient fausses, et dans le mauvais sens.** Le schéma
exigeait au moins 44 caractères pour les DEUX clés. Or un navigateur produit :

- `p256dh` — un point de courbe non compressé, 65 octets (préfixe 0x04 +
  deux coordonnées de 32), soit **87 caractères** en base64url sans
  remplissage ;
- `auth`   — un secret de 16 octets, soit **22 caractères**.

Le plancher de 44 rejetait donc systématiquement `auth_key` (422), et la
colonne `VARCHAR(44)` tronquait `p256dh` (500). Aucun abonnement ne pouvait
aboutir, par deux chemins indépendants. Les bornes ci-dessous encadrent les
valeurs réelles sans les coller au caractère près : un remplissage `=` ou une
évolution de l'encodage côté navigateur ne doit pas refermer le piège.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

# base64url de 65 octets = 87 caractères (88 avec remplissage).
P256DH_MIN_LENGTH = 80
P256DH_MAX_LENGTH = 128
# base64url de 16 octets = 22 caractères (24 avec remplissage).
AUTH_MIN_LENGTH = 16
AUTH_MAX_LENGTH = 32


class PushSubscriptionCreate(BaseModel):
    """⚠️ Plus de `user_id` : le compte vient du JETON, jamais du corps.

    Le champ était déclaré, exigé par un validateur — et ignoré par le router,
    qui prenait déjà `current_user.id`. Il ne pouvait donc produire que deux
    choses : un 422 pour un client qui ne le connaissait pas (ce qui était le
    cas du nôtre), et l'illusion qu'on pouvait abonner quelqu'un d'autre.
    """

    endpoint: str = Field(..., min_length=1, max_length=2000)
    p256dh: str = Field(
        ...,
        min_length=P256DH_MIN_LENGTH,
        max_length=P256DH_MAX_LENGTH,
        description="Clé publique ECDH du client, base64url (65 octets)",
    )
    auth_key: str = Field(
        ...,
        min_length=AUTH_MIN_LENGTH,
        max_length=AUTH_MAX_LENGTH,
        description="Secret d'authentification du client, base64url (16 octets)",
    )


class PushSubscriptionDelete(BaseModel):
    """Le retrait désigne l'APPAREIL par son endpoint — cf. `delete_subscription`."""

    endpoint: str = Field(..., min_length=1, max_length=2000)


class PushSubscriptionResponse(BaseModel):
    id: uuid.UUID
    endpoint: str
    user_id: uuid.UUID | None = None
    establishment_id: uuid.UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
