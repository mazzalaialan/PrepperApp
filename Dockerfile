# Imagen única de VikArg Survival: servidor (push + transferencias) que además
# sirve la propia PWA, para una instalación 100% autónoma. Ver docs/SERVIDOR.md.

# ---------- 1. Build de la PWA ----------
FROM node:26-alpine AS app
WORKDIR /build
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/ ./
RUN npm run build

# ---------- 2. Servidor ----------
FROM node:26-alpine
WORKDIR /srv
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/src ./src
COPY --from=app /build/dist ./public

RUN mkdir -p /data && chown node:node /data
USER node

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    APP_DIR=/srv/public
VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "src/main.ts"]
