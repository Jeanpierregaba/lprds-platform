"""Le surnom — ce par quoi l'établissement NOMME les gens.

« Tata Victoire », « Papa Anaïs » : c'est le nom d'usage, et l'état civil n'en
est que le repli. Trois défauts se cumulaient, et aucun ne cassait quoi que ce
soit :

1. `UserResponse` ne portait PAS `nickname`, donc `GET /auth/me` ne le
   renvoyait jamais : aucun écran ne pouvait nommer l'utilisateur connecté
   autrement que par son état civil ;
2. l'**admin** était le seul compte à ne pas avoir de champ surnom — ni à la
   création, ni ensuite ;
3. les six templates d'email de bienvenue disent `{{ nickname }}` depuis
   toujours et **personne ne le passait** : Jinja rend une variable absente par
   une chaîne vide, donc tous ces emails saluaient « Bienvenue sur LPRDS,  ! ».
"""
from app.modules.auth import email as mail
from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard


def _creer_etablissement(client, su, code, admin_email, **admin_extra):
    admin = {"email": admin_email, "first_name": "Ad", "last_name": code,
             "password": "Creche2026", **admin_extra}
    return client.post("/establishments", headers=su, json={
        "code": code, "name": f"C{code}", "address": "a",
        "email": f"c@{code.lower()}.fr", "phone": "+229", "admin": admin,
    })


def test_un_admin_sans_surnom_est_refuse(client):
    """Exigé comme pour les parents et le personnel : l'admin était le seul
    compte que les écrans ne pouvaient nommer que par son état civil."""
    su = login(client, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    ck("sans surnom → 422", _creer_etablissement(client, su, "NOSUR", "a@nosur.fr").status_code, 422)
    ck("avec surnom → 201", _creer_etablissement(
        client, su, "AVSUR", "a@avsur.fr", nickname="Direction AVSUR").status_code, 201)


def test_le_compte_connecte_connait_son_surnom(client):
    """⚠️ La cause de fond : le champ existait en base, mais pas dans la
    réponse. Un écran ne peut pas afficher ce que l'API ne renvoie pas."""
    su = login(client, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(client, su, "SURNM", "admin@surnm.fr")
    me = client.get("/auth/me", headers=adm).json()
    ck("GET /auth/me porte le surnom", me["nickname"], "Direction SURNM")


def test_le_surnom_d_un_admin_existant_peut_etre_pose(client):
    """Les admins créés avant le champ n'ont aucun autre moyen d'en recevoir
    un : leur fiche ne se saisit qu'à la création, et un compte admin ne se
    recrée pas (quota de 3, retrait = désactivation)."""
    su = login(client, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(client, su, "PATCH1", "admin@patch1.fr")
    autre = onboard(client, su, "PATCH2", "admin@patch2.fr")  # noqa: F841 — isolation

    etab = client.get("/establishments?search=PATCH1", headers=su).json()["items"][0]
    admin_id = client.get(f"/establishments/{etab['id']}/admins", headers=su).json()[0]["id"]

    r = client.patch(f"/establishments/{etab['id']}/admins/{admin_id}",
                     headers=su, json={"nickname": "Maîtresse Ada"})
    ck("surnom modifié", r.status_code, 200)
    ck("la réponse porte le nouveau surnom", r.json()["nickname"], "Maîtresse Ada")
    ck("le compte lui-même le voit", client.get("/auth/me", headers=adm).json()["nickname"],
       "Maîtresse Ada")

    ck("surnom vide refusé", client.patch(
        f"/establishments/{etab['id']}/admins/{admin_id}",
        headers=su, json={"nickname": ""}).status_code, 422)

    autre_etab = client.get("/establishments?search=PATCH2", headers=su).json()["items"][0]
    ck("un admin d'un AUTRE établissement → 404, jamais 403", client.patch(
        f"/establishments/{autre_etab['id']}/admins/{admin_id}",
        headers=su, json={"nickname": "Pirate"}).status_code, 404)

    ck("réservé au superadmin", client.patch(
        f"/establishments/{etab['id']}/admins/{admin_id}",
        headers=adm, json={"nickname": "Moi-même"}).status_code, 403)


def test_l_email_de_bienvenue_salue_par_le_surnom(client, monkeypatch):
    """⚠️ Prouve le défaut Jinja : la variable était absente du contexte, donc
    rendue VIDE. Le contrôle porte sur le HTML réellement construit — un
    template ne casse jamais sur une variable manquante."""
    envoyes = []

    async def capture(message):
        envoyes.append(message)

    monkeypatch.setattr(mail, "_send", capture)

    su = login(client, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(client, su, "MAILS", "admin@mails.fr")
    envoyes.clear()

    enfant = client.post("/children", headers=adm, json={
        "last_name": "T", "first_names": "E", "birth_date": "2022-01-01",
        "admission_date": "2024-09-01", "residence_address": "x", "guardians": [],
    }).json()["id"]
    r = client.post("/parents", headers=adm, json={
        "first_name": "Anaïs", "last_name": "Kossou", "nickname": "Maman Anaïs",
        "phone": "+229", "email": "maman@mails.fr", "password": "Parent2026",
        "child_ids": [enfant],
    })
    ck("parent créé", r.status_code, 201)
    ck("un email est parti", len(envoyes), 1)

    html = envoyes[0].alternative_body
    assert "Maman Anaïs" in html, html[:400]
    # Le défaut d'origine : la salutation se terminait sur un vide.
    assert "Bienvenue sur LPRDS,  !" not in html, html[:400]
