# ── Stage 1: Build Nuxt frontend (SPA / static) ───────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run generate
# nuxt generate (not nuxt build) pre-renders index.html into .output/public/
# With ssr:false, nuxt build skips that step and expects Nitro to serve it dynamically.

# ── Stage 2: Compile API TypeScript ───────────────────────────────────────────
FROM node:20-alpine AS api-ts-builder
WORKDIR /build
COPY api/package*.json ./
COPY api/tsconfig.json ./
RUN npm install
COPY api/src/ ./src/
RUN npm run build

# ── Stage 3: Install production Node modules (includes native compilation) ────
FROM node:20-alpine AS api-deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY api/package*.json ./
RUN npm ci --omit=dev

# ── Stage 4: Lean runtime image ───────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Copy compiled API
COPY --from=api-ts-builder /build/dist/ ./dist/

# Copy production node_modules (with compiled native bindings)
COPY --from=api-deps /app/node_modules/ ./node_modules/

# Copy Nuxt static build
COPY --from=frontend-builder /build/.output/public/ ./public/

# Create mount-point directories so Docker volume ownership is predictable
RUN mkdir -p /app/data /app/config

EXPOSE 3000

CMD ["node", "dist/server.js"]
