# Stage 1: Build Frontend
FROM docker.io/library/node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Backend & Runtime
FROM docker.io/library/node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache python3 make g++ bash curl

COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install --no-audit --no-fund

COPY backend/ ./
RUN npm run build

# Copy built frontend into dist folder
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV HOST_ROOT=/host_root

EXPOSE 3000

CMD ["node", "dist/server.js"]
