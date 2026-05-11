# syntax=docker/dockerfile:1.7
# ===== Build stage =====
FROM node:24-alpine AS builder
WORKDIR /app

# Install OS deps for Prisma
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# ===== Runtime stage =====
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl tini && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
