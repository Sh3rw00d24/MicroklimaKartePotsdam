# Stadtpuls Potsdam - Produktions-Image.
# Zwei Stufen: "deps" installiert nur die Produktionsabhängigkeiten (express, adm-zip),
# "runtime" enthält ausschließlich Code + node_modules - kein npm/Build-Werkzeug im Endimage.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app

# Eigener, unprivilegierter User statt root - Alpine bringt dafür keinen passenden mit.
RUN addgroup -S stadtpuls && adduser -S stadtpuls -G stadtpuls

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server.js dwd-klimadaten.js ./
COPY public ./public

# public/dev-test.js ist gitignored (nur für lokale Entwicklung) und darf nie in einem
# Image landen - falls die Datei lokal existiert, hier zur Sicherheit trotzdem entfernen.
RUN rm -f public/dev-test.js

# Cache-Verzeichnis für DWD-Referenzdaten (siehe dwd-klimadaten.js). Rein ephemer: geht
# ein Pod verloren, wird beim nächsten Start einfach neu heruntergeladen/berechnet - kein
# Volume nötig. Muss dem unprivilegierten User gehören, damit er hineinschreiben kann.
RUN mkdir -p data && chown -R stadtpuls:stadtpuls /app

USER stadtpuls

ENV PORT=3000
EXPOSE 3000

# Kein curl/wget im Alpine-Image - Healthcheck deshalb direkt mit Node.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000), r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
