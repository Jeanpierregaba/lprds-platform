"""
Le schéma migré doit correspondre exactement aux modèles.

Pourquoi ce test existe : le projet a déjà payé deux fois pour cette dérive.

  • `weekly_menus` manquait au registre central (`app/core/models.py`) : l'app
    tournait quand même (import en cascade via le router), mais l'autogenerate
    ne voyait jamais la table et proposait de la SUPPRIMER à chaque révision —
    fantôme croisé deux fois avant diagnostic (cf. claude.md, module Menus).
  • `blog_gallery_categories.created_at` a été créée sans `nullable=False`
    alors que le modèle la déclare NOT NULL. Deux révisions successives ont dû
    écarter la correction à la main pour ne pas l'embarquer par mégarde.

Les deux se voyaient en lançant un `alembic revision --autogenerate` à vide et
en lisant la sortie. C'est exactement le genre de discipline qu'un humain
oublie, et dont l'oubli est silencieux : rien ne casse, jusqu'au jour où une
vraie dérive passe inaperçue au milieu du bruit, ou se retrouve appliquée sans
avoir été voulue.

Le test compare les métadonnées SQLAlchemy au schéma réellement migré par
`conftest.py` (qui déroule toutes les révisions depuis zéro). Il attrape donc
aussi bien une migration oubliée qu'un modèle absent du registre.
"""

import asyncio

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext

from app.core.models import Base
from tests.conftest import TEST_SCHEMA, _schema_engine
from tests.helpers import ck


def _is_application_object(obj, name, type_, reflected, compare_to) -> bool:
    return not (type_ == "table" and name == "alembic_version")


def _describe(diff) -> str:
    """Rend une entrée de diff lisible dans le message d'échec.

    Alembic renvoie soit un tuple (`('add_column', schema, table, Column)`),
    soit une liste de tuples pour les modifications de colonne — d'où le
    déballage, sinon l'échec afficherait un objet SQLAlchemy illisible.
    """
    if isinstance(diff, list):
        return " ; ".join(_describe(entry) for entry in diff)
    kind = diff[0]
    rest = [str(part) for part in diff[1:] if part is not None]
    return f"{kind}: {' '.join(rest)[:160]}"


def test_models_match_migrated_schema():
    """Aucune différence entre `app/core/models.py` et le schéma migré.

    Un échec ici veut dire l'une de ces trois choses :
      1. un modèle a changé sans migration → écrire la révision ;
      2. une migration a été écrite à la main de travers → la corriger ;
      3. un module de modèles manque au registre `app/core/models.py` → l'y
         ajouter (sinon l'autogenerate proposera de DROP ses tables).
    """

    async def collect() -> list:
        engine = _schema_engine()
        try:
            async with engine.connect() as conn:
                return await conn.run_sync(
                    lambda sync_conn: compare_metadata(
                        MigrationContext.configure(
                            sync_conn,
                            opts={
                                # Le schéma de test n'est pas `public` : sans
                                # ces options, chaque table serait vue comme
                                # « à créer » et le test échouerait partout.
                                "version_table_schema": TEST_SCHEMA,
                                "include_schemas": False,
                                # `alembic_version` est la comptabilité
                                # d'Alembic lui-même, pas un modèle : sans ce
                                # filtre, le test réclamerait sa suppression à
                                # chaque exécution.
                                "include_object": _is_application_object,
                            },
                        ),
                        Base.metadata,
                    )
                )
        finally:
            await engine.dispose()

    differences = asyncio.run(collect())
    ck(
        "dérive entre les modèles et le schéma migré\n  "
        + "\n  ".join(_describe(d) for d in differences),
        len(differences),
        0,
    )
