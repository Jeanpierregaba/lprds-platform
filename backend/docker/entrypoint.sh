#!/bin/sh
set -e

echo "→ Migrations (alembic upgrade head)..."
alembic upgrade head

echo "→ Seed du superadmin (idempotent)..."
python -m app.core.seed

echo "→ Démarrage de l'API..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
