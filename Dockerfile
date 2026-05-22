# syntax=docker/dockerfile:1.7
#
# gsposte-server — multi-stage build
#
# Pin Node 16 perché:
#  - mongoose 5.8 è EOL e non è ufficialmente testato oltre Node 16
#  - typescript 3.7 e ts-node 8 sono pre-Node-18
#  - puppeteer 2.1 chiede una specifica major (Chromium "puppeteer-vendored",
#    ma noi usiamo il chromium di sistema per evitare il download postinstall)
#
# Runtime su Debian 12 (bookworm) anziché Alpine perché Puppeteer + Chromium
# su Alpine è una via crucis di font/glibc. bookworm-slim ha Chromium upstream.

# ──────────────────────────────────────────────────────────────────────────────
# Stage 1: builder
# ──────────────────────────────────────────────────────────────────────────────
FROM node:26-bookworm-slim AS builder

WORKDIR /build

# Toolchain (build-essential + python3 per i pochi binding nativi)
RUN apt-get update && \
    apt-get install --no-install-recommends -y \
        build-essential python3 ca-certificates \
        # puppeteer scaricherebbe un proprio chromium da ~150MB nello postinstall:
        # SKIP, useremo /usr/bin/chromium di runtime
    && rm -rf /var/lib/apt/lists/*

# Evita download di Chromium da parte di Puppeteer postinstall
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_SKIP_DOWNLOAD=true

# Cache layer: lockfile-only first
COPY package.json yarn.lock .npmrc ./

# yarn classic è già preinstallato in node:16-bookworm-slim
RUN yarn install --frozen-lockfile --network-timeout 600000

# Sorgenti
COPY tsconfig.json ./
COPY tslint.json ./
COPY provisions.json ./
COPY src ./src
COPY public ./public

# Build TS → dist/
RUN yarn build

# Riduci a sole prod deps
RUN yarn install --frozen-lockfile --production --network-timeout 600000 && \
    yarn cache clean

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2: runtime
# ──────────────────────────────────────────────────────────────────────────────
FROM node:26-bookworm-slim AS runtime

WORKDIR /usr/src/app

ENV NODE_ENV=production \
    TZ=Europe/Rome \
    NODE_OPTIONS="--enable-source-maps" \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Pacchetti runtime:
#   - chromium + libs/font necessari a Puppeteer
#   - poppler-utils + ghostscript + imagemagick → manipolazione PDF
#   - tini → PID 1 corretto
#   - tzdata → timezone
#   - ca-certificates → CA bundle base
RUN apt-get update && \
    apt-get install --no-install-recommends -y \
        chromium \
        fonts-freefont-ttf fonts-liberation \
        libxss1 libxtst6 libnss3 libatk-bridge2.0-0 libgtk-3-0 libdrm2 \
        libgbm1 libasound2 libxshmfence1 \
        poppler-utils ghostscript imagemagick \
        tini ca-certificates tzdata wget \
    && ln -sf /usr/share/zoneinfo/Europe/Rome /etc/localtime \
    && echo "Europe/Rome" > /etc/timezone \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ImageMagick di default rifiuta di leggere/scrivere PDF (CVE-2016-3714 mitigation).
# Riabilita SOLO PDF read/write — necessario al PdfService di gsposte-server.
RUN sed -i \
        -e 's|<policy domain="coder" rights="none" pattern="PDF" />|<policy domain="coder" rights="read\|write" pattern="PDF" />|' \
        -e 's|<policy domain="coder" rights="none" pattern="PS" />|<policy domain="coder" rights="read" pattern="PS" />|' \
        /etc/ImageMagick-6/policy.xml || true

# Artefatti dal builder
COPY --chown=node:node --from=builder /build/node_modules ./node_modules
COPY --chown=node:node --from=builder /build/dist ./dist
COPY --chown=node:node --from=builder /build/public ./public
COPY --chown=node:node --from=builder /build/package.json ./package.json

# I volumi del compose montano sopra le sotto-cartelle di public/ per persistere.
# Senza volumi (dev) le cartelle restano scrivibili dall'utente "node".
RUN mkdir -p public/pdf public/invoices public/xlsx public/attachments public/logs public/images && \
    chown -R node:node public

USER node

EXPOSE 5000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/src/index.js"]
