const fetch = require("node-fetch")
const { dirname, join } = require("path")
const { ensureDir, existsSync, exists, renameSync, rename, removeSync, unlink, readFileSync, readFile, writeFile } = require("fs-extra")
const { promisify } = require("util")

const move = promisify(rename), read = promisify(readFile), remove = promisify(unlink)

let cached
module.exports = { cache, handleCaching , extractURL, getCached: () => cached, queueCacheSave, forceSave, loadCached }

const Logger = require("./ipc")
const { getConfig, getCacheLocation } = require("./config")

function getCacheStats() {
    const stats = {
        cachedFiles: 0,
        cachedSize: 0,
        oldCache: false
    }

    for(const v of Object.values(cached)) {
        stats.cachedFiles++
        if(v.length != undefined)
            stats.cachedSize += v.length
        else
            stats.oldCache = true
    }

    return stats
}
function loadCached() {
    const CACHE_INFORMATION = join(getCacheLocation(), "cached.json")
    Logger.log(`Loading cached from ${CACHE_INFORMATION}.`)

    if(existsSync(CACHE_INFORMATION + ".bak")) {
        if(existsSync(CACHE_INFORMATION))
            removeSync(CACHE_INFORMATION)
        renameSync(CACHE_INFORMATION + ".bak", CACHE_INFORMATION)
    }

    if(existsSync(CACHE_INFORMATION))
        cached = JSON.parse(readFileSync(CACHE_INFORMATION))
    else
        cached = {}

    Logger.send("stats", getCacheStats())
}

let invalidatedMainVersion = false

let saveCachedTimeout = undefined, saveCachedCount = 0
const currentlyLoadingCache = {}

async function cache(cacheFile, file, url, version, lastmodified, headers = {}) {
    if(currentlyLoadingCache[file])
        return await new Promise((resolve) => currentlyLoadingCache[file].push(resolve))

    currentlyLoadingCache[file] = []
    Logger.log("Loading...", file)

    const response = (rep) => {
        currentlyLoadingCache[file].forEach(k => k(rep))
        delete currentlyLoadingCache[file]
        return rep
    }

    const options = { method: "GET", headers }

    // Request to only send full file if it has changed since last request
    if(lastmodified)
        options.headers["If-Modified-Since"] = lastmodified
    else
        delete options.headers["If-Modified-Since"]


    // Fetch data
    let data
    try {
        data = await fetch(url, options)
    } catch (error) {
        // Server denied request/network failed,
        if(lastmodified) {
            Logger.error("Fetch failed, using cached version", error)
            Logger.addStatAndSend("blocked")
            invalidatedMainVersion = true

            return response({
                "status": 200,
                "contents": await readFile(cacheFile)
            })
        } else {
            Logger.error("Fetch failed, no cached version", error)
            Logger.addStatAndSend("failed")

            return response({
                "status": 502,
                "contents": "The caching proxy was unable to handle your request and no cached version was available"
            })
        }
    }

    if(data.status == 304) {
        if(!lastmodified)
            // Not modified, but we don't have cached data to update
            return response({ "status": data.status })

        // If not modified, update version tag and send cached data
        Logger.log("Not modified", file)
        Logger.addStatAndSend("notModified")

        cached[file].version = version
        queueCacheSave()

        return response({
            "status": 200,
            "contents": await readFile(cacheFile)
        })
    }

    // Send cached data for forbidden requests.
    // This bypasses the foreign ip block added on 2020-02-25
    if(data.status == 403 && lastmodified) {
        Logger.log("HTTP 403: Forbidden, using cached data")
        Logger.addStatAndSend("blocked")
        // Invalidate main.js and version.json versions since they might be outdated
        invalidatedMainVersion = true

        return response({
            "status": 200,
            "contents": await readFile(cacheFile)
        })
    }

    // These won't have useful responses
    if(data.status >= 400) {
        Logger.log("HTTP error ", data.status, url)
        Logger.addStatAndSend("failed")

        return response(data)
    }

    // Store contents and meta-data
    const contents = await data.buffer()
    const rep = {
        "status": data.status,
        "contents": contents,
        "downloaded": true
    }
    Logger.addStatAndSend("fetched")

    const queueSave = async () => {
        await ensureDir(dirname(cacheFile))

        if(await exists(cacheFile + ".tmp"))
            await remove(cacheFile + ".tmp")
        await writeFile(cacheFile + ".tmp", contents)
        if(await exists(cacheFile))
            await remove(cacheFile)
        await move(cacheFile + ".tmp", cacheFile)

        cached[file] = {
            "version": version,
            "lastmodified": data.headers.get("last-modified"),
            "length": (+data.headers.get("content-length")) || contents.length,
            "cache": data.headers.get("cache-control")
        }
        queueCacheSave()

        Logger.log("Saved", url)
        response(rep)
    }

    if(cached[file])
        cached[file].length = (+data.headers.get("content-length")) || contents.length
    queueSave()

    return rep
}

async function send(req, res, cacheFile, contents, file, cachedFile, forceCache = false) {
    if (res) {
        if(contents == undefined)
            contents = await read(cacheFile)

        if(!forceCache && getConfig().verifyCache && cachedFile && cachedFile.length && contents.length != cachedFile.length) {
            Logger.error(cacheFile, "length doesn't match!", contents.length, cachedFile.length)
            Logger.addStatAndSend("bandwidthSaved", -contents.length)
            return handleCaching(req, res, true)
        }

        if(file && isBlacklisted(file)) {
            res.setHeader("Server", "nginx")
            if(!cachedFile || cachedFile.cache == "no-cache" || cachedFile.cache == "no-store")
                res.setHeader("Cache-Control", "no-store")
            else
                res.setHeader("Cache-Control", "max-age=2592000, public, immutable")
        } else {
            // Copy KC server headers
            res.setHeader("Server", "nginx")
            res.setHeader("X-DNS-Prefetch-Control", "off")

            if(getConfig().disableBrowserCache || isInvalidated(file)) {
                res.setHeader("Cache-Control", "no-store")
                res.setHeader("Pragma", "no-cache")
            } else {
                res.setHeader("Cache-Control", "max-age=2592000, public, immutable")
                res.setHeader("Pragma", "public")
            }
        }

        // TODO switch or some table
        if (cacheFile.endsWith(".php") || cacheFile.endsWith(".html"))
            res.setHeader("Content-Type", "text/html")
        else if(cacheFile.endsWith(".png"))
            res.setHeader("Content-Type", "image/png")
        else if(cacheFile.endsWith(".json"))
            res.setHeader("Content-Type", "application/json")
        else if(cacheFile.endsWith(".css"))
            res.setHeader("Content-Type", "text/css")
        else if(cacheFile.endsWith(".mp3"))
            res.setHeader("Content-Type", "audio/mpeg")
        else if(cacheFile.endsWith(".js"))
            res.setHeader("Content-Type", "application/x-javascript")

        res.end(contents)
    }
}

async function handleCaching(req, res, forceCache = false) {
    const { url, headers } = req
    const { file, cacheFile, version } = extractURL(url)

    // Return cached if version matches
    const cachedFile = cached[file]
    let lastmodified = undefined
    if(cachedFile && await exists(cacheFile) && !forceCache) {
        // Allowing single ? for bugged _onInfoLoadComplete
        if((cachedFile.version == version || version == "" || version == "?") && !isBlacklisted(file) && !isInvalidated(file)) {
            const contents = await read(cacheFile)
            Logger.addStatAndSend("inCache")
            Logger.addStatAndSend("bandwidthSaved", contents.length)
            return await send(req, res, cacheFile, contents, file, cachedFile, forceCache)
        }

        // Version doesn't match, lastmodified set
        lastmodified = cachedFile.lastmodified
    }

    // Not in cache or version mismatch, need to check with server
    const result = await cache(cacheFile, file, url, version, lastmodified, headers)

    if(!result.contents) {
        if(!res) return

        res.statusCode = result.status
        return res.end()
    }

    if(result.status >= 500 && result.contents) {
        if(!res) return

        res.statusCode = result.status
        return res.end(result.contents)
    }

    if(!result.downloaded)
        Logger.addStatAndSend("bandwidthSaved", result.contents.length)
    return await send(req, res, cacheFile, result.contents, file, cached[file], forceCache)
}

function extractURL(url) {
    let version = ""
    let file = "/" + url.match(/^https?:\/\/\d+\.\d+\.\d+\.\d+\/(.*)$/)[1]
    if (url.includes("?")) {
        version = url.substring(url.indexOf("?"))
        file = file.substring(0, file.indexOf("?"))
    }
    if(file.endsWith("/")) file += "index.html"

    const cacheFile = join(getCacheLocation(), file)
    return { file, cacheFile, version }
}

const blacklisted = ["/gadget_html5/", "/kcscontents/information/index.html", "/kcscontents/news/"]
function isBlacklisted(file) {
    return blacklisted.some(k => file.startsWith(k))
}

const invalidated = ["/kcs2/version.json", "/kcs2/js/main.js"]
function isInvalidated(file) {
    return invalidatedMainVersion && invalidated.some(k => file == k)
}

function queueCacheSave() {
    if (++saveCachedCount < 25) {
        if (saveCachedTimeout)
            clearTimeout(saveCachedTimeout)
        saveCachedTimeout = setTimeout(forceSave, 5000)
    }
}

async function forceSave() {
    if (saveCachedTimeout)
        clearTimeout(saveCachedTimeout)

    saveCachedTimeout = undefined
    saveCachedCount = 0
    await saveCached()
    saveCachedCount = 0
}

async function saveCached() {
    const CACHE_INFORMATION = join(getCacheLocation(), "cached.json")
    const str = JSON.stringify(cached)
    if(str.length == 2)
        return Logger.log(`Cache is empty, not saved to ${CACHE_INFORMATION}`)

    await ensureDir(getCacheLocation())
    if(await exists(CACHE_INFORMATION))
        await move(CACHE_INFORMATION, CACHE_INFORMATION + ".bak")
    await writeFile(CACHE_INFORMATION, str)
    if(await exists(CACHE_INFORMATION + ".bak"))
        await remove(CACHE_INFORMATION + ".bak")

    Logger.send("stats", getCacheStats())
    Logger.log(`Saved cached to ${CACHE_INFORMATION}.`)
}
