FROM node:22.20.0-bookworm-slim AS deps
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/gateway/package.json apps/gateway/package.json
COPY apps/agent/package.json apps/agent/package.json
COPY apps/ingestion/package.json apps/ingestion/package.json
COPY packages/cache/package.json packages/cache/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/databricks/package.json packages/databricks/package.json
COPY packages/security/package.json packages/security/package.json
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run prisma:generate && npm run build

FROM node:22.20.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
RUN groupadd --system --gid 10001 app && useradd --system --uid 10001 --gid app app
COPY --from=build --chown=app:app /workspace/node_modules ./node_modules
COPY --from=build --chown=app:app /workspace/apps ./apps
COPY --from=build --chown=app:app /workspace/packages ./packages
COPY --from=build --chown=app:app /workspace/package.json ./package.json
USER 10001
ARG SERVICE=gateway
ENV SERVICE=${SERVICE}
CMD ["sh", "-c", "node apps/${SERVICE}/dist/main.js"]
