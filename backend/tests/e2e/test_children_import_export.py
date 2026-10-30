"""
Import / export des fiches enfants (format plat XLSX / CSV).

Scénarios couverts :
- Modèle vierge téléchargeable (XLSX + CSV, mêmes colonnes).
- Import de création (matricule vide) → enfants créés, tuteurs/autorisés
  rattachés, statut actif/inactif respecté.
- Export → round-trip : le fichier exporté est réimportable, et un second
  passage d'un export est IDEMPOTENT (0 création, N mises à jour) via le
  matricule round-trip.
- Rejets par ligne (matricule inconnu, tuteur manquant, dates incohérentes,
  statut inconnu) → toujours 200 partiel avec rapport détaillé.
- Isolation : le superadmin est exclu (403) — enfants = données RGPD.
"""

from tests.helpers import SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, ck, login, onboard

HEADERS = [
    "matricule", "nom", "prenoms", "nom_usuel",
    "date_naissance", "lieu_naissance", "date_admission", "adresse",
    "statut", "section",
    "notes_comportement", "preferences", "notes_medicales",
    "restrictions_alimentaires", "medicaments", "medecin_nom", "medecin_tel",
    "tuteur_1_nom", "tuteur_1_prenoms", "tuteur_1_tel", "tuteur_1_email",
    "tuteur_2_nom", "tuteur_2_prenoms", "tuteur_2_tel", "tuteur_2_email",
    "tuteur_3_nom", "tuteur_3_prenoms", "tuteur_3_tel", "tuteur_3_email",
    "autorise_1_nom", "autorise_1_prenoms", "autorise_1_tel",
    "autorise_2_nom", "autorise_2_prenoms", "autorise_2_tel",
]

TWO_ROWS = [
    ["", "Kossou", "Anaïs", "", "2022-03-14", "Lomé", "2024-09-02",
     "12 rue des Palmiers", "actif", "PS",
     "", "", "", "", "", "", "",
     "KOSSOU", "Papa", "+228 90 00 00 00", "papa@ex.tg",
     "", "", "", "",
     "", "", "", "",
     "KOSSOU", "Tonton", "+228 91 00 00 00",
     "", "", ""],
    ["", "Dupont", "Ibrahim", "Ibo", "2021-06-01", "", "2023-10-01",
     "3 av. de la Plage", "inactif", "PS",
     "Observations", "verts", "aucune", "", "x", "Dr A", "+228 1",
     "DUPONT", "Maman", "+228 92 00 00 00", "",
     "", "", "", "",
     "", "", "", "",
     "", "", "",
     "", "", ""],
]


def _csv_bytes(rows, delim=";"):
    import csv
    from io import StringIO

    buf = StringIO()
    w = csv.writer(buf, delimiter=delim)
    w.writerow(HEADERS)
    w.writerows(rows)
    return ("\ufeff" + buf.getvalue()).encode("utf-8")


def _parse_csv(content: bytes):
    import csv
    from io import StringIO

    text = content.decode("utf-8-sig")
    reader = csv.DictReader(StringIO(text), delimiter=";")
    return list(reader), reader.fieldnames


def _setup(client, adm):
    dep = client.post("/departments", json={"name": "Maternelle"}, headers=adm).json()
    sec = client.post("/sections",
                      json={"department_id": dep["id"], "name": "PS"},
                      headers=adm).json()
    return dep, sec


def test_import_create_and_template(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    _setup(c, adm)

    r = c.get("/children/import/template", params={"file_format": "xlsx"}, headers=adm)
    ck("Modèle xlsx 200", r.status_code, 200)
    ck("Nom fichier modèle", r.headers["content-disposition"].split("filename=")[1].strip('"'),
       "modele_enfants.xlsx")

    # Le nom du fichier suit la langue du compte (le contenu aussi : titres de
    # feuille et feuille d'aide ; les en-têtes de colonnes, eux, sont le format
    # d'échange et restent identiques pour que l'export reste réimportable).
    c.patch("/auth/me/locale", json={"locale": "en"}, headers=adm)
    r_en = c.get("/children/import/template", params={"file_format": "xlsx"}, headers=adm)
    ck("Nom fichier modèle en anglais",
       r_en.headers["content-disposition"].split("filename=")[1].strip('"'),
       "children-template.xlsx")
    c.patch("/auth/me/locale", json={"locale": "fr"}, headers=adm)

    payload = _csv_bytes(TWO_ROWS)
    r = c.post("/children/import",
               files={"file": ("import.csv", payload, "text/csv")}, headers=adm)
    ck("Import CSV 200 partiel", r.status_code, 200)
    body = r.json()
    ck("2 créés", body["crees"], 2)
    ck("0 mis à jour", body["mis_a_jour"], 0)
    ck("0 rejetés", body["rejetees"], 0)
    ck("matricules générés", all(("matricule" in line and
                                  line["matricule"].startswith("LPRDS-"))
                                 for line in body["lignes"]), True)
    # Code stable, jamais un libellé : c'est le frontend qui traduit.
    ck("inactif respecté ligne 2", body["lignes"][1]["statut"], "created")

    details = c.get("/children",
                    params={"include_inactive": "true"}, headers=adm).json()
    ck("2 enfants en base", details["total"], 2)
    by_name = {item["last_name"]: item for item in details["items"]}
    ana = c.get(f"/children/{by_name['Kossou']['id']}", headers=adm).json()
    ck("tuteur rattaché", ana["guardians"][0]["last_name"], "KOSSOU")
    ck("autorisé rattaché", ana["authorized_persons"][0]["last_name"], "KOSSOU")
    ck("aucune adresse par défaut (adresse fournie)", ana["residence_address"],
       "12 rue des Palmiers")
    ck("lieu de naissance importé", ana["birth_place"], "Lomé")
    ibo = c.get(f"/children/{by_name['Dupont']['id']}", headers=adm).json()
    ck("statut inactif", ibo["is_active"], False)
    ck("nom usuel préfixé aux notes", ibo["behavioral_notes"].startswith("Nom usuel : Ibo"),
       True)

    # Round-trip idempotent : réimporter l'export → 0 création, N mises à jour
    exp = c.get("/children/export", params={"file_format": "csv",
                                            "include_inactive": "true"}, headers=adm)
    ck("Export CSV 200", exp.status_code, 200)
    rows, fields = _parse_csv(exp.content)
    ck("Colonnes export == colonnes import", fields, HEADERS)
    ck("Export contient les 2 enfants", len(rows), 2)
    # ⚠️ Le champ doit SURVIVRE à l'aller-retour. Une colonne ajoutée au
    # modèle mais oubliée du format s'efface en silence au réimport : l'export
    # rend une cellule vide, et le second passage écrase la vraie valeur. C'est
    # le contrôle qui manque quand on ne regarde que « 0 rejet ».
    par_nom = {r["nom"]: r for r in rows}
    ck("lieu de naissance exporté", par_nom["Kossou"]["lieu_naissance"], "Lomé")
    ck("  et vide quand il l'était", par_nom["Dupont"]["lieu_naissance"], "")

    r2 = c.post("/children/import",
                files={"file": ("roundtrip.csv", exp.content, "text/csv")},
                headers=adm)
    body2 = r2.json()
    ck("Round-trip : 0 création", body2["crees"], 0)
    ck("Round-trip : 2 mises à jour", body2["mis_a_jour"], 2)
    ck("Round-trip : 0 rejet", body2["rejetees"], 0)
    apres = c.get(f"/children/{by_name['Kossou']['id']}", headers=adm).json()
    ck("Round-trip : le lieu de naissance n'a pas été effacé",
       apres["birth_place"], "Lomé")


def test_import_rejections_and_isolation(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    _setup(c, adm)

    rows = [
        # matricule inconnu → rejet
        ["LPRDS-X0001", "Inconnu", "Z", "", "2020-01-01", "", "2021-01-01",
         "adr",
         "actif", "PS", "", "", "", "", "", "", "", "G", "P", "+228", "",
         "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
        # aucun tuteur → CRÉÉ (règle assouplie : tuteur non obligatoire)
        ["", "Sans", "Tuteur", "", "2020-01-01", "", "2021-01-01", "adr",
         "actif", "PS"] + [""] * (len(HEADERS) - 10),
        # dates incohérentes (admission < naissance) → rejet
        ["", "Bizarre", "Dates", "", "2021-01-01", "", "2020-01-01", "adr",
         "actif", "PS", "", "", "", "", "", "", "", "G", "P", "+228", "",
         "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
        # statut inconnu → rejet
        ["", "Genre", "Fatou", "", "2020-01-01", "", "2021-01-01", "adr",
         "peut-etre", "PS", "", "", "", "", "", "", "", "G", "P", "+228", "",
         "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ]
    r = c.post("/children/import",
               files={"file": ("bad.csv", _csv_bytes(rows), "text/csv")}, headers=adm)
    ck("200 partiel malgré les rejets", r.status_code, 200)
    body = r.json()
    ck("1 créé (sans tuteur accepté)", body["crees"], 1)
    ck("3 rejets", body["rejetees"], 3)
    errors = [line["erreur"] or "" for line in body["lignes"]]
    ck("matricule inconnu signalé", any("matricule inconnu" in e for e in errors), True)
    ck("dates incohérentes signalées", any("naissance" in e or "admission" in e
                                           for e in errors), True)
    ck("statut inconnu signalé", any("statut inconnu" in e for e in errors), True)
    ck("avertissements par ligne présents", all(hasattr(line, "avertissements")
                                                or isinstance(line["avertissements"], list)
                                                for line in body["lignes"]), True)

    # Même fichier, compte passé en anglais : les motifs de rejet suivent la
    # langue DU COMPTE (elle prime sur Accept-Language dès qu'on est
    # authentifié), les codes de statut ne bougent pas.
    ck("bascule du compte en anglais",
       c.patch("/auth/me/locale", json={"locale": "en"}, headers=adm).status_code, 200)
    r_en = c.post("/children/import",
                  files={"file": ("bad.csv", _csv_bytes(rows), "text/csv")},
                  headers={**adm, "Accept-Language": "fr"})
    body_en = r_en.json()
    errors_en = [line["erreur"] or "" for line in body_en["lignes"]]
    ck("motif de rejet en anglais", any("unknown status" in e for e in errors_en), True)
    ck("aucun motif français en anglais",
       any("statut inconnu" in e for e in errors_en), False)
    ck("statuts restent des codes stables",
       {line["statut"] for line in body_en["lignes"]} <= {"created", "updated", "rejected"},
       True)
    c.patch("/auth/me/locale", json={"locale": "fr"}, headers=adm)

    # Superadmin exclu (isolation RGPD) — même page que les données enfants
    r = c.post("/children/import", files={"file": ("a.csv", _csv_bytes(TWO_ROWS), "text/csv")},
               headers=su)
    ck("Superadmin 403 sur l'import", r.status_code, 403)
    r = c.get("/children/export", headers=su)
    ck("Superadmin 403 sur l'export", r.status_code, 403)


def test_import_xlsx_and_csv_compat(client):
    c = client
    su = login(c, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    adm = onboard(c, su, "LPRDS", "admin@a.fr")
    _setup(c, adm)

    # XLSX complet (en-têtes + 1 ligne) via le modèle édité
    r = c.get("/children/import/template", params={"file_format": "xlsx"}, headers=adm)
    # Re-téléverser le modèle tel quel (1 ligne d'exemple) → création DUPONT
    r = c.post("/children/import",
               files={"file": ("modele.xlsx", r.content,
                               "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
               headers=adm)
    ck("Import du modèle XLSX (ligne d'exemple)", r.status_code, 200)
    body = r.json()
    ck("1 créé via XLSX", body["crees"], 1)
    ck("exemple en base (DUPONT Aya)", (c.get("/children", headers=adm).json()["total"]), 1)

    # Export XLSX réimportable
    exp = c.get("/children/export", params={"file_format": "xlsx"}, headers=adm)
    ck("Export XLSX 200", exp.status_code, 200)
    ck("mimetype XLSX", exp.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument"), True)