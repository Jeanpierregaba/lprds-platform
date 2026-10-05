"""Génère un couple de clés VAPID pour les notifications push Web.

    docker compose exec backend python scripts/generate_vapid_keys.py

⚠️ **Un SCRIPT et non une ligne à recopier.** La commande vivait en commentaire
dans `config.py` et dans `.env.example`, et les DEUX étaient fausses —
différemment : l'une affichait la représentation de l'objet (`print(v)`),
l'autre appelait `private_key_b64()`, qui n'existe pas dans `py_vapid`. Aucune
n'avait jamais été exécutée, et c'est exactement pour cela que les clés
n'avaient jamais été posées en production : les notifications push n'y ont
jamais fonctionné, sans qu'aucune erreur ne remonte (l'envoi est best-effort,
donc l'échec est journalisé et jamais affiché).

⚠️ La clé privée ne doit JAMAIS atteindre le frontend. Seule la publique est
exposée, par `GET /api/v1/notifications/vapid-public-key`.

⚠️ **Un couple DIFFÉRENT par environnement.** Partager les clés entre préprod et
production rendrait un abonnement pris sur l'une valide sur l'autre : une
notification de test pourrait partir à de vrais parents.

⚠️ Changer les clés d'une installation existante INVALIDE tous les abonnements
déjà pris — chaque navigateur devra se réabonner. Sans conséquence ici, où il
n'en existe aucun, mais à savoir avant toute rotation ultérieure.
"""

import base64

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid01


def _b64(raw: bytes) -> str:
    """base64url sans remplissage — la forme attendue par le navigateur."""
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def main() -> None:
    vapid = Vapid01()
    vapid.generate_keys()

    private_key = _b64(
        vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
    )
    # Point non compressé (65 octets, préfixe 0x04) : c'est ce que
    # `applicationServerKey` exige côté navigateur, pas un PEM.
    public_key = _b64(
        vapid.public_key.public_bytes(
            serialization.Encoding.X962,
            serialization.PublicFormat.UncompressedPoint,
        )
    )

    print("# À coller dans backend/.env, puis redémarrer le backend.")
    print(f"VAPID_PRIVATE_KEY={private_key}")
    print(f"VAPID_PUBLIC_KEY={public_key}")
    print("VAPID_SUBJECT=mailto:hello@lespetitsrayonsdesoleil.net")


if __name__ == "__main__":
    main()
