"""Signature d'une diffusion par les parents, et registre côté admin.

Ce que ces contrôles protègent, dans l'ordre d'importance :

1. **Une attestation ne se rejoue pas.** Signer deux fois renvoie 409 au lieu
   de rafraîchir la ligne : réécrire `signed_at` déplacerait la date d'un
   engagement déjà pris. C'est la seule différence de fond avec l'accusé de
   lecture, qui est lui parfaitement idempotent.
2. **Le registre part de l'AUDIENCE**, pas des lectures : il doit nommer ceux
   qui n'ont RIEN fait — les seuls qu'on ait besoin de relancer. Une liste des
   lecteurs et une liste des signataires répondraient à la lettre de la demande
   en taisant cette réponse.
3. **Signer implique lu**, sinon « non lu mais signé » devient possible et le
   compteur de lecture dit moins que celui des signatures.
4. **Le drapeau gouverne tout** : pas de signature possible sur une diffusion
   qui n'en demande pas (422), et le retirer n'effacera jamais ce qui a été
   signé.
"""
from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard


def _make_parent(c, adm, email, child_ids):
    r = c.post("/parents", json={
        "first_name": "Awa", "last_name": email.split("@")[0].capitalize(),
        "nickname": f"Parent {email}", "phone": "+229", "email": email,
        "password": "Parent2026", "child_ids": child_ids,
    }, headers=adm)
    assert r.status_code == 201, r.text[:300]
    return login(c, email, "Parent2026")


def _setup(c, adm):
    """Un département, deux enfants, deux parents — le second sert de témoin
    « n'a rien fait », qui est précisément ce que le registre doit montrer."""
    dep = c.post("/departments", json={"name": "Mat"}, headers=adm).json()
    sec = c.post("/sections", json={"department_id": dep["id"], "name": "PS"},
                 headers=adm).json()
    children = []
    for name in ("Emma", "Hugo"):
        children.append(c.post("/children", json={
            "last_name": name, "first_names": "Enfant",
            "birth_date": "2023-01-01", "admission_date": "2025-01-01",
            "residence_address": "x", "department_id": dep["id"],
            "section_id": sec["id"], "guardians": [],
        }, headers=adm).json())
    signataire = _make_parent(c, adm, "signe@e.fr", [children[0]["id"]])
    temoin = _make_parent(c, adm, "temoin@e.fr", [children[1]["id"]])
    return dep, signataire, temoin


def test_signature_cycle_complet(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dep, signataire, temoin = _setup(c, adm)

    r = c.post("/messaging/announcements", json={
        "title": "Règlement intérieur", "body": "Merci de signer.",
        "requires_signature": True,
    }, headers=adm)
    ck("diffusion à signer créée", r.status_code, 201)
    ann = r.json()
    ck("  le drapeau est bien posé", ann["requires_signature"], True)
    ck("  audience = 2 parents", ann["total_parents"], 2)
    ck("  personne n'a signé à la création", ann["signature_count"], 0)

    # ── Vue parent : le drapeau est visible, la signature pas encore posée.
    vue = c.get(f"/messaging/announcements/{ann['id']}", headers=signataire).json()
    ck("le parent voit qu'une signature est demandée", vue["requires_signature"], True)
    ck("  il n'a pas encore signé", vue["is_signed"], False)
    ck("  et aucune date n'est annoncée", vue["signed_at"], None)
    ck("  le compteur admin ne lui est pas exposé", vue["signature_count"], None)

    # ── Signature.
    r = c.post(f"/messaging/announcements/{ann['id']}/sign",
               json={"signed_name": "Awa Signe"}, headers=signataire)
    ck("signature acceptée", r.status_code, 200)
    signe = r.json()
    ck("  le parent est marqué signataire", signe["is_signed"], True)
    ck("  la date lui est renvoyée", signe["signed_at"] is not None, True)
    ck("  ⚠️ signer marque AUSSI comme lu", signe["is_read"], True)

    # ── Rejouer la signature : refusé.
    r = c.post(f"/messaging/announcements/{ann['id']}/sign",
               json={"signed_name": "Awa Signe"}, headers=signataire)
    ck("⚠️ une seconde signature est refusée (409)", r.status_code, 409)
    inchange = c.get(f"/messaging/announcements/{ann['id']}",
                     headers=signataire).json()
    ck("  et la date de la PREMIÈRE n'a pas bougé",
       inchange["signed_at"], signe["signed_at"])

    # ── Compteur admin.
    vue_adm = c.get(f"/messaging/announcements/{ann['id']}", headers=adm).json()
    ck("compteur admin : 1 signature sur 2", vue_adm["signature_count"], 1)
    ck("  et 1 lecture sur 2 (la signature l'a posée)", vue_adm["read_count"], 1)

    # ── Registre : les trois états, le témoin en tête.
    r = c.get(f"/messaging/announcements/{ann['id']}/recipients", headers=adm)
    ck("registre accessible à l'admin", r.status_code, 200)
    reg = r.json()
    ck("  toute l'audience y figure, pas seulement les lecteurs",
       reg["total"], 2)
    ck("  compteurs repris", (reg["read_count"], reg["signature_count"]), (1, 1))
    ck("  le drapeau est rappelé", reg["requires_signature"], True)
    ck("⚠️ le parent qui n'a RIEN fait est en tête de liste",
       reg["items"][0]["email"], "temoin@e.fr")
    ck("  il n'a ni lecture…", reg["items"][0]["read_at"], None)
    ck("  …ni signature", reg["items"][0]["signed_at"], None)
    ck("  le signataire est en fin de liste", reg["items"][1]["email"], "signe@e.fr")
    ck("  avec le nom qu'il a TAPÉ", reg["items"][1]["signed_name"], "Awa Signe")
    ck("  et sa lecture", reg["items"][1]["read_at"] is not None, True)

    # ── Le témoin lit sans signer : état intermédiaire distinct.
    ck("le témoin marque lu",
       c.post(f"/messaging/announcements/{ann['id']}/read",
              headers=temoin).status_code, 204)
    reg = c.get(f"/messaging/announcements/{ann['id']}/recipients",
                headers=adm).json()
    ck("2 lectures, 1 seule signature", (reg["read_count"], reg["signature_count"]),
       (2, 1))
    lu_non_signe = next(i for i in reg["items"] if i["email"] == "temoin@e.fr")
    ck("⚠️ lire n'est PAS signer", lu_non_signe["signed_at"], None)
    ck("  mais la lecture est bien enregistrée",
       lu_non_signe["read_at"] is not None, True)


def test_signature_refusee_quand_elle_n_est_pas_demandee(client):
    """Une diffusion ordinaire ne se signe pas : le registre afficherait sinon
    une attestation que personne n'a sollicitée."""
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dep, parent, _ = _setup(c, adm)

    ann = c.post("/messaging/announcements",
                 json={"title": "Goûter", "body": "Demain."}, headers=adm).json()
    ck("par défaut, aucune signature n'est demandée",
       ann["requires_signature"], False)
    r = c.post(f"/messaging/announcements/{ann['id']}/sign",
               json={"signed_name": "Awa Signe"}, headers=parent)
    ck("signer une diffusion qui ne le demande pas → 422", r.status_code, 422)
    ck("  et le message le dit", "signature" in r.json()["detail"].lower(), True)


def test_retirer_le_drapeau_n_efface_jamais_une_signature(client):
    """⚠️ Le drapeau gouverne ce qu'on DEMANDE, pas ce qui a été donné.

    Le décocher cesse de solliciter les parents restants ; effacer au passage
    les attestations déjà recueillies détruirait la seule trace de leur
    engagement — exactement ce que cette fonctionnalité existe pour conserver.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dep, parent, _ = _setup(c, adm)

    ann = c.post("/messaging/announcements", json={
        "title": "Autorisation", "body": "Sortie scolaire.",
        "requires_signature": True,
    }, headers=adm).json()
    c.post(f"/messaging/announcements/{ann['id']}/sign",
           json={"signed_name": "Awa Signe"}, headers=parent)

    r = c.patch(f"/messaging/announcements/{ann['id']}",
                json={"requires_signature": False}, headers=adm)
    ck("le drapeau se retire", r.status_code, 200)
    ck("  et il est bien retiré", r.json()["requires_signature"], False)
    ck("⚠️ la signature déjà donnée est CONSERVÉE", r.json()["signature_count"], 1)

    reg = c.get(f"/messaging/announcements/{ann['id']}/recipients",
                headers=adm).json()
    ck("  le registre la montre toujours", reg["signature_count"], 1)
    ck("  avec son nom", next(
        i for i in reg["items"] if i["email"] == "signe@e.fr")["signed_name"],
       "Awa Signe")

    # Et on peut la redemander : le parent qui avait signé n'a rien à refaire.
    c.patch(f"/messaging/announcements/{ann['id']}",
            json={"requires_signature": True}, headers=adm)
    r = c.post(f"/messaging/announcements/{ann['id']}/sign",
               json={"signed_name": "Awa Signe"}, headers=parent)
    ck("redemander la signature ne la fait pas resigner (409)", r.status_code, 409)


def test_signature_et_perimetre(client):
    """Isolation : hors périmètre ou hors établissement, on ne signe pas — et
    la réponse est 404, jamais 403 (on ne révèle pas l'existence)."""
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    autre_adm = onboard(c, su, "AUTRE", "admin@b.fr")
    dep, parent, _ = _setup(c, adm)

    # Un second département, sans aucun enfant du parent.
    prim = c.post("/departments", json={"name": "Prim"}, headers=adm).json()
    ciblee = c.post("/messaging/announcements", json={
        "title": "Primaire", "body": "Réunion.", "requires_signature": True,
        "department_ids": [prim["id"]],
    }, headers=adm).json()

    r = c.post(f"/messaging/announcements/{ciblee['id']}/sign",
               json={"signed_name": "Awa Signe"}, headers=parent)
    ck("signer hors de son périmètre → 404", r.status_code, 404)

    # Diffusion désactivée : elle a disparu du portail du parent.
    ann = c.post("/messaging/announcements", json={
        "title": "Annulée", "body": "...", "requires_signature": True,
    }, headers=adm).json()
    c.patch(f"/messaging/announcements/{ann['id']}",
            json={"is_active": False}, headers=adm)
    r = c.post(f"/messaging/announcements/{ann['id']}/sign",
               json={"signed_name": "Awa Signe"}, headers=parent)
    ck("signer une diffusion désactivée → 404", r.status_code, 404)

    # Registre : l'admin d'un autre établissement ne voit rien.
    ck("registre inter-établissement → 404",
       c.get(f"/messaging/announcements/{ann['id']}/recipients",
             headers=autre_adm).status_code, 404)
    # Et un parent n'accède jamais à la liste nominative des autres.
    ck("le registre est fermé aux parents (hors RBAC : admin seul)",
       c.get(f"/messaging/announcements/{ann['id']}/recipients",
             headers=parent).status_code, 403)


def test_le_compteur_ne_depasse_jamais_son_total_apres_reciblage(client):
    """⚠️ Les lectures des parents sortis du périmètre sont élaguées ; les
    signatures, non. Le compteur reste cohérent parce qu'il ne compte que les
    signataires de l'audience COURANTE — pas parce qu'on détruit la preuve.

    ⚠️ Le reciblage se fait vers un département PEUPLÉ, et c'est tout l'enjeu
    du test. Première version : on reciblait vers un département vide, donc
    l'audience était vide et le court-circuit `if not audience: return 0`
    suffisait à faire passer le contrôle. Prouvé par sabotage — en retirant
    l'intersection avec l'audience, le test passait quand même. Avec un
    destinataire réel dans le nouveau périmètre, le compteur non borné
    annoncerait 1 signature là où le signataire n'est plus destinataire.
    """
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    dep, parent, _ = _setup(c, adm)

    # Un second département, avec SON propre parent — l'audience du nouveau
    # périmètre doit être non vide.
    prim = c.post("/departments", json={"name": "Prim"}, headers=adm).json()
    sec = c.post("/sections", json={"department_id": prim["id"], "name": "CP"},
                 headers=adm).json()
    enfant = c.post("/children", json={
        "last_name": "Zoe", "first_names": "Enfant",
        "birth_date": "2023-01-01", "admission_date": "2025-01-01",
        "residence_address": "x", "department_id": prim["id"],
        "section_id": sec["id"], "guardians": [],
    }, headers=adm).json()
    _make_parent(c, adm, "prim@e.fr", [enfant["id"]])

    ann = c.post("/messaging/announcements", json={
        "title": "Charte", "body": "À signer.", "requires_signature": True,
    }, headers=adm).json()
    ck("broadcast : 3 destinataires", ann["total_parents"], 3)
    c.post(f"/messaging/announcements/{ann['id']}/sign",
           json={"signed_name": "Awa Signe"}, headers=parent)
    ck("1 signature sur 3", c.get(f"/messaging/announcements/{ann['id']}",
                                  headers=adm).json()["signature_count"], 1)

    # Reciblage vers Prim : le signataire n'y a aucun enfant, mais le nouveau
    # périmètre a bien un destinataire.
    r = c.patch(f"/messaging/announcements/{ann['id']}",
                json={"department_ids": [prim["id"]]}, headers=adm)
    ck("reciblage accepté", r.status_code, 200)
    ck("  la nouvelle audience n'est PAS vide", r.json()["total_parents"], 1)
    ck("⚠️ le signataire sorti du périmètre ne compte plus",
       r.json()["signature_count"], 0)
    reg = c.get(f"/messaging/announcements/{ann['id']}/recipients",
                headers=adm).json()
    ck("  le registre ne montre que le destinataire courant", reg["total"], 1)
    ck("  et aucune signature dans ce périmètre", reg["signature_count"], 0)

    # Retour au broadcast : la signature n'avait pas été détruite.
    r = c.patch(f"/messaging/announcements/{ann['id']}",
                json={"department_ids": []}, headers=adm)
    ck("de retour en broadcast, l'audience revient", r.json()["total_parents"], 3)
    ck("⚠️ et la signature est toujours là", r.json()["signature_count"], 1)
