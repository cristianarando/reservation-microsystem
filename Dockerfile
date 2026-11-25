# Multi-stage Dockerfile for Next.js + Prisma + SQLite on Node 24 Alpine (Oracle Cloud E2.1.Micro linux/amd64)
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat openssl tzdata

FROM base AS deps
WORKDIR /app
RUN npm install -g pnpm@10
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile --shamefully-hoist && \
    npx prisma generate

FROM deps AS builder
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM base AS prisma-cli
WORKDIR /opt/prisma
RUN npm install --no-save --omit=dev prisma@6.19.3 && \
    npm cache clean --force

FROM base AS runner
LABEL org.opencontainers.image.source="https://github.com/cristianarando/reservation-microsystem"
LABEL org.opencontainers.image.description="Reservas App Production Image"
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV TZ=America/La_Paz
ENV NODE_OPTIONS="--max-old-space-size=384"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /app/data/backups && \
    chown -R nextjs:nodejs /app/data

# Copy isolated Prisma CLI (no global npm install in runner), runtime fonts, public assets, and Next.js standalone bundle
COPY --from=prisma-cli --chown=nextjs:nodejs /opt/prisma /opt/prisma
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/src/assets/fonts ./src/assets/fonts
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
