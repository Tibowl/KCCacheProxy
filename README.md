# KanColle Cache Proxy

[![ko-fi](https://www.ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/A0A81MOVN)

This is a local proxy meant to cache KC assets and bypass the gadget IP block. It can be preloaded from a cache dump (linked below). This will improve loading of assets on top of browser built-in cache.

## Installation and setup

See [Installation and setup](https://github.com/Tibowl/KCCacheProxy/wiki/Installation-and-setup) for more information. If you still have problems, try in Chrome with the extension linked there and if you still have, you can ask for help in the [reddit KC discord](https://discord.gg/RtSadWM).

## Docker

### Proxy server

Download [docker-compose.yaml](./docker-compose.yaml) or copy below code

```yaml
---
services:
  kccp:
    container_name: kccp
    image: ghcr.io/hitomarukonpaku/kccp
    restart: unless-stopped
    ports:
      - 8080:8080
    volumes:
      - ./data:/data
      - ./cache:/cache
```

Open terminal in the same folder with above file then run

```sh
docker compose up -d
```

### Preload

```sh
docker run --rm -v "./cache:/cache" ghcr.io/hitomarukonpaku/kccp preload
```

### Update image

```sh
docker pull ghcr.io/hitomarukonpaku/kccp
```
