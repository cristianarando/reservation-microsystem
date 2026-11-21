# Multi-stage Dockerfile for Next.js + Prisma + SQLite on Node 26 (AMD64 & ARM64 / Oracle Cloud Ampere)
FROM node:26-alpine AS base
RUN apk add --no-cache libc6-compat openssl tzdata && \
    npm install -g pnpm

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile --shamefully-hoist && \
    npx prisma generate
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM base AS runner
LABEL org.opencontainers.image.source="https://github.com/cristianarando/reservation-microsystem"
LABEL org.opencontainers.image.description="Reservas App Production Image"
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV TZ=America/La_Paz

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /app/data && \
    chown -R nextjs:nodejs /app/data && \
    npm install -g prisma@6.19.3

# Copy Next.js standalone bundle and Prisma schema
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/api/bootstrap || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
