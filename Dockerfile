# =============================================================================
# Multi-domain static host in one image.
#   Stage 1: build every domain from config/domains.json with Astro
#   Stage 2: serve them all with Caddy (auto-HTTPS via Let's Encrypt)
#
# Hostinger Docker Manager builds and runs this via docker-compose.yml.
# =============================================================================

# ---- Stage 1: build -----------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# Install deps first for layer caching.
COPY site/package.json site/package-lock.json* ./site/
RUN cd site && npm install --no-fund --no-audit

# Copy sources and build every domain -> site/dist/<domain>
COPY config ./config
COPY build-all.mjs ./
COPY site ./site
RUN node build-all.mjs

# ---- Stage 2: serve -----------------------------------------------------
FROM caddy:2-alpine AS runtime

# Generated Caddyfile (run scripts/gen-caddy.mjs before building the image).
COPY caddy/Caddyfile /etc/caddy/Caddyfile

# All built sites land under /srv/www/<domain>, matching the Caddyfile roots.
COPY --from=builder /app/site/dist/ /srv/www/

RUN mkdir -p /var/log/caddy

EXPOSE 80 443
# Caddy's default entrypoint reads /etc/caddy/Caddyfile.
