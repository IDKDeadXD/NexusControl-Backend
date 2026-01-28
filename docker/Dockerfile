FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Install git for git-based bots
RUN apk add --no-cache git

# Install production dependencies only
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --only=production
RUN npx prisma generate

# Copy built files
COPY --from=builder /app/dist ./dist

# Create bots directory
RUN mkdir -p /app/bots

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3001

CMD ["node", "dist/index.js"]
