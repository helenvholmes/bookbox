# BookBox as a container: the database and covers live in /data (mount a volume there).
# See the README's "Docker" section, and docker-compose.yml for a ready-made setup.

# Both stages use the same Debian base, so the native parts (sharp, libsql) built here run below.
FROM node:24-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Standalone output (next.config.ts) holds only the files the server needs; it doesn't include
# all of public/ or the built static files, so they're copied in beside it. (It can already hold part
# of public/, so the contents are copied, not the folder, which would nest it as public/public.)
RUN npm run build \
  && mkdir -p .next/standalone/.next/static .next/standalone/public \
  && cp -R .next/static/. .next/standalone/.next/static/ \
  && cp -R public/. .next/standalone/public/

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/
VOLUME /data
EXPOSE 3000
# Answers once the server is up (the sign-in page needs no account).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/login').then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
