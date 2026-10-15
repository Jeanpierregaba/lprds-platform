"""Ce que Yahoo exige d'un email et que notre code ne donnait pas.

Signalé par un établissement : les adresses **yahoo.fr / yahoo.com** ne
recevaient jamais rien, alors que Gmail recevait tout. Deux défauts, tous deux
dans notre code, tous deux invisibles côté expéditeur — avec un DMARC en
`p=quarantine`, un message écarté par Yahoo disparaît **sans rebond** :

1. le `Message-ID` portait le nom d'hôte de la machine (l'identifiant du
   conteneur Docker, ou `…ip6.arpa` sur un poste), jamais le domaine
   d'expédition ;
2. les emails partaient en **HTML seul**, sans partie `text/plain`.

Contrôle au ras du moteur, pas par HTTP : la suite tourne avec
`MAIL_SUPPRESS_SEND`, donc aucun message ne part — ce qu'on vérifie ici c'est
le message CONSTRUIT, c'est-à-dire exactement ce que lirait le filtre.
"""
import asyncio
import functools
import uuid

import pytest
from fastapi_mail.msg import MailMsg

from app.core.config import settings
from app.modules.auth import email as mail
from app.modules.messaging.email import send_announcement_email
from tests.helpers import ck


def _message_construit() -> tuple[object, str]:
    """Le message qu'une notification de diffusion fabrique réellement."""
    captures = []

    async def _capture(message):
        captures.append(message)

    original, mail._send = mail._send, _capture
    try:
        asyncio.run(
            send_announcement_email(
                to="parent@yahoo.fr",
                parent_first_name="Anaïs",
                announcement_id=uuid.uuid4(),
                title="Réunion de rentrée",
                establishment_name="Les Petits Rayons De Soleil",
                requires_signature=True,
            )
        )
    finally:
        mail._send = original

    assert captures, "aucun message construit"
    schema = captures[0]
    mime = asyncio.run(MailMsg(schema)._message("hello@example.net"))
    return schema, mime


def test_le_message_id_porte_le_domaine_d_expedition():
    domaine = str(settings.mail_from).rsplit("@", 1)[-1].lower()
    if "." not in domaine:
        pytest.skip(f"MAIL_FROM sans domaine exploitable ({settings.mail_from})")

    _schema, mime = _message_construit()
    ids = mime.get_all("Message-ID") or []
    # Un SECOND Message-ID serait pire que le défaut corrigé : c'est pourquoi
    # la correction remplace le fabricant au lieu de passer par `headers=`.
    ck("Un seul en-tête Message-ID", len(ids), 1)
    assert ids[0].rstrip(">").endswith(f"@{domaine}"), ids[0]


def test_la_bibliotheque_expose_toujours_le_symbole_remplace():
    """Garde-fou de montée de version : sans ce symbole, la correction du
    Message-ID s'éteindrait en silence et Yahoo recommencerait à écarter."""
    import fastapi_mail.msg as msg

    assert hasattr(msg, "make_msgid"), "fastapi-mail n'expose plus make_msgid"
    assert isinstance(msg.make_msgid, functools.partial), (
        "make_msgid n'est plus celui que nous posons"
    )


def test_chaque_email_part_en_texte_ET_en_html():
    _schema, mime = _message_construit()
    types = [p.get_content_type() for p in mime.walk() if not p.is_multipart()]
    assert "text/plain" in types, types
    assert "text/html" in types, types
    # Dans un multipart/alternative, la DERNIÈRE partie est la préférée : le
    # HTML doit venir après le texte, sinon tout le monde lit du texte brut.
    ck("Le HTML est la version préférée", types.index("text/html") > types.index("text/plain"), True)


def test_la_version_texte_garde_le_lien_et_perd_les_balises():
    schema, _mime = _message_construit()
    texte = schema.body
    assert "<" not in texte and "&nbsp;" not in texte, texte[:200]
    assert "Réunion de rentrée" in texte, texte[:200]
    # Un bouton n'est rien en texte sans son URL : sans elle, la version texte
    # dirait au parent qu'une diffusion l'attend, sans lui dire où.
    assert "/dashboard/parent/messaging" in texte, texte
    assert "announcement=" in texte, texte
