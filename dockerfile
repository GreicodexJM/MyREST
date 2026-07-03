FROM node:22-alpine

WORKDIR /usr/src/app

# only install production deps to keep image small
COPY package.json package-lock.json /usr/src/app/
RUN npm ci --omit=dev && npm cache clean --force

COPY index.js /usr/src/app
COPY bin/ /usr/src/app/bin
COPY lib/ /usr/src/app/lib
COPY docker-entrypoint.sh /docker-entrypoint.sh

# run as unprivileged user; app dir stays read-only, uploads (dynamic mode only) go to /usr/src/app/storage
RUN mkdir -p /usr/src/app/storage \
    && chown -R node:node /usr/src/app/storage \
    && chmod +x /docker-entrypoint.sh
USER node

# env
# Option 1: Use DATABASE_URL for connection (supports SSL)
# ENV DATABASE_URL mysql://user:password@host:port/database?ssl=true
# Option 2: Use individual parameters
ENV DATABASE_HOST=127.0.0.1
ENV DATABASE_USER=root
ENV DATABASE_PASSWORD=password
ENV DATABASE_NAME=sakila
ENV JWT_SECRET=""
ENV JWT_REQUIRED=false
ENV STORAGE_FOLDER=/usr/src/app/storage

EXPOSE 3000
ENTRYPOINT ["/docker-entrypoint.sh"]
