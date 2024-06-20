# BASE
FROM node:18-alpine AS base

RUN apk add --no-cache tini

WORKDIR /app

COPY package*.json ./

# DEPENDENCIES
FROM base AS dependencies

RUN npm install --no-progress --omit=dev

# BUILDER
FROM base AS builder

COPY . .

# RELEASE
FROM base

ENV DATA_DIR=/data

RUN mkdir /data
RUN mkdir /cache

COPY docker/docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder      /app/src/proxy ./src
COPY --from=builder      /app/docker/config.json ./config.json

EXPOSE 8080

ENTRYPOINT [ "/sbin/tini", "--", "/bin/sh", "/docker-entrypoint.sh" ]

CMD [ "proxy" ]
