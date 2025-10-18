# KanColle Cache Proxy

This is a local proxy meant to cache KC assets and bypass the gadget IP block. It can be preloaded from a cache dump (linked below). This will improve loading of assets on top of browser built-in cache.

## Installation and setup

See [Installation and setup](https://github.com/Tibowl/KCCacheProxy/wiki/Installation-and-setup) for more information. If you still have problems, try in Chrome with the extension linked there and if you still have, you can ask for help in the [reddit KC discord](https://discord.gg/RtSadWM).

## Docker usage

### Running

Download [docker-compose.yaml](./docker-compose.yaml) or copy below code

```yaml
---
services:
  kccp:
    container_name: kccp
    image: ghcr.io/hitomarukonpaku/kccacheproxy
    restart: unless-stopped
    ports:
      - 8080:8080
    volumes:
      - ./data:/data
      - ./cache:/cache
```

Open terminal in the same folder with above file then run

```bash
docker compose up -d
```

### Preload

```bash
docker run --rm -v "./cache:/cache" ghcr.io/hitomarukonpaku/kccacheproxy preload
```

### Update image version

```bash
docker pull ghcr.io/hitomarukonpaku/kccacheproxy
docker compose up -d
```

### English Patch

> [KanColle-English-Patch-KCCP](https://github.com/Oradimi/KanColle-English-Patch-KCCP)

---

Before running any below command, start `kccp` container

- Add

  ```bash
  docker exec -it kccp node src/kce add
  docker restart kccp
  ```

- Remove

  ```bash
  docker exec -it kccp node src/kce remove
  docker restart kccp
  ```

- Toggle on/off

  ```bash
  docker exec -it kccp node src/kce toggle
  docker restart kccp
  ```
