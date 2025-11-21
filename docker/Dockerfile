# BASE
FROM node:lts-alpine AS base

RUN apk add --no-cache tini

WORKDIR /app

COPY package*.json ./

# DEPENDENCIES
FROM base AS dependencies

RUN npm ci --omit=dev

# BUILDER
FROM base AS builder

COPY . .

# RELEASE
FROM base

RUN apk add --no-cache bash curl

RUN mkdir /data
RUN mkdir /cache

COPY docker/docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder      /app/src/proxy ./src
COPY --from=builder      /app/docker/config.json ./config.json

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV CONFIG_DEFAULT_FILE=/app/config.json
ENV HOST=0.0.0.0

ENTRYPOINT [ "/sbin/tini", "--", "/bin/sh", "/docker-entrypoint.sh" ]

CMD [ "proxy" ]
