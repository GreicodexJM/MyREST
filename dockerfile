FROM mhart/alpine-node:latest

RUN mkdir -p /usr/src/{app,bin,lib}
WORKDIR /usr/src/app

# only install production deps to keep image small
COPY package.json /usr/src/app
RUN npm install --production

COPY index.js /usr/src/app
COPY bin/ /usr/src/app/bin
COPY lib/ /usr/src/app/lib
COPY docker-entrypoint.sh /docker-entrypoint.sh

# env 
# Option 1: Use DATABASE_URL for connection (supports SSL)
# ENV DATABASE_URL mysql://user:password@host:port/database?ssl=true
# Option 2: Use individual parameters
ENV DATABASE_HOST 127.0.0.1
ENV DATABASE_USER root
ENV DATABASE_PASSWORD password
ENV DATABASE_NAME sakila
ENV JWT_SECRET ""
ENV JWT_REQUIRED false

EXPOSE 3000
ENTRYPOINT ["/docker-entrypoint.sh"]
