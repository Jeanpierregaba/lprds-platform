FROM python:3.12.3-slim AS base

# psycopg/asyncpg n'ont pas besoin de libpq système (drivers purs Python),
# mais build-essential reste nécessaire pour compiler les dépendances natives
# (ex: certaines versions de pydantic-core / cryptography sans wheel préconstruit).
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements/base.txt requirements/base.txt
RUN pip install --no-cache-dir -r requirements/base.txt

COPY . .

# Écrit par l'application (stockage local des fichiers uploadés) — un volume
# est monté ici en docker-compose pour persister entre redémarrages.
RUN mkdir -p /app/media

RUN chmod +x docker/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["docker/entrypoint.sh"]
