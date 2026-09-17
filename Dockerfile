FROM oven/bun:1-bookworm-slim AS deps

WORKDIR /app
RUN chown bun:bun /app
USER bun

COPY --chown=bun:bun package.json bun.lock ./
RUN bun install

FROM deps AS builder

COPY --chown=bun:bun next.config.ts tsconfig.json tailwind.config.ts postcss.config.mjs components.json ./
COPY --chown=bun:bun src ./src
COPY --chown=bun:bun public ./public
COPY --chown=bun:bun prisma ./prisma

ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=file:/app/db/custom.db

RUN mkdir -p db public/uploads && \
    bun run db:generate && \
    bun run db:push && \
    bun run build

FROM oven/bun:1-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_URL=file:/app/db/custom.db

COPY --from=builder --chown=bun:bun /app/.next/standalone ./
COPY --from=builder --chown=bun:bun /app/.next/static ./.next/static
COPY --from=builder --chown=bun:bun /app/public ./public
COPY --from=builder --chown=bun:bun /app/db ./db

USER bun

RUN mkdir -p public/uploads db && \
    chmod -R u+rwX public/uploads db

EXPOSE 3000

CMD ["bun", "server.js"]
