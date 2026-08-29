FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm install

# Copy source code
COPY . .

# Build Next.js
RUN npm run build

# Final stage
FROM node:18-alpine

WORKDIR /app

# Copy built assets
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Expose port
EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Start the server
CMD ["node", "server.js"]
