FROM node:20.19.5-bookworm-slim AS build

WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20.19.5-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    WEBCMD_WINDOW=background \
    CLOAKBROWSER_CACHE_DIR=/home/node/.cloakbrowser

WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node backend/skills ./skills
RUN npx playwright-core install-deps chromium \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /home/node/.cloakbrowser \
    && chown -R node:node /home/node/.cloakbrowser

USER node
RUN npx cloakbrowser install
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "dist/server.js"]
