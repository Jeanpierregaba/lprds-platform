FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# ⚠️ Une variable `NEXT_PUBLIC_*` est lue à la COMPILATION du bundle, pas au
# runtime : `env_file` dans le compose arrive trop tard. Sans cet ARG, le
# bundle n'embarque aucune version, le sondage de `/version.json` reste
# désactivé, et un navigateur déjà ouvert garde l'ancien code après un
# déploiement — exactement ce que l'auto-update PWA devait éviter.
#
# Valeur alimentée par le workflow depuis le SHA du commit déployé.
ARG NEXT_PUBLIC_APP_VERSION=""
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION

RUN pnpm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
