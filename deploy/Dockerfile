# Obraz Kolędnika: jeden proces Node serwuje stronę, API i WebSockety.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    CONTENT_DIR=/app/content \
    DATA_DIR=/data \
    WEB_DIST=/app/web
# Serwer jest zbundlowany do jednego pliku — bez node_modules w obrazie.
COPY --from=build /app/apps/server/dist/index.cjs ./server.cjs
COPY --from=build /app/apps/web/dist ./web
COPY content ./content
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server.cjs"]
