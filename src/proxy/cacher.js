const fetch = require("node-fetch").default
const { dirname, join } = require("path")
const { ensureDir, existsSync, exists, rename, unlink, readFileSync, readFile, writeFile } = require("fs-extra")
const { promisify } = require("util")

/** @typedef {import("http").IncomingMessage} IncomingMessage */
/** @typedef {import("http").ServerResponse} ServerResponse */

const move = promisify(rename), read = promisify(readFile), remove = promisify(unlink)

const invalidated = ["/kcs2/version.json", "/kcs2/js/main.js"]
const blacklisted = ["/gadget_html5/", "/kcscontents/information/index.html", "/kcscontents/news/"]

let cached
module.exports = { cache, handleCaching, extractURL, getCached: () => cached, queueCacheSave, forceSave, loadCached, invalidated }

const Logger = require("./ipc")
const { getConfig, getCacheLocation, saveConfig } = require("./config")
const { patch } = require("./mod/patcher")

const logSource = "kccp-cacher"

/**
 * Get cache statistics
 */
function getCacheStats() {
    const stats = {
        cachedFiles: 0,
        cachedSize: 0,
        oldCache: false
    }

    for (const v of Object.values(cached)) {
        stats.cachedFiles++
        if (v.length != undefined)
            stats.cachedSize += v.length
        else
            stats.oldCache = true
    }

    return stats
}

/**
 * Load cache from config getCacheLocation
 */
function loadCached() {
    const CACHE_INFORMATION = join(getCacheLocation(), "cached.json")
    Logger.log(logSource, `Loading cached from ${CACHE_INFORMATION}.`)

    try {
        if (existsSync(CACHE_INFORMATION)) {
            cached = JSON.parse(readFileSync(CACHE_INFORMATION))
            return Logger.send(logSource, "stats", getCacheStats())
        }
    } catch (error) {
        Logger.error(logSource, "Failed to load cached.json")
    }

    try {
        if (existsSync(CACHE_INFORMATION + ".bak")) {
            cached = JSON.parse(readFileSync(CACHE_INFORMATION + ".bak"))
            return Logger.send(logSource, "stats", getCacheStats())
        }
    } catch (error) {
        Logger.error(logSource, "Failed to load cached.json.bak")
    }

    if (cached == undefined) {
        cached = {}
        Logger.log(logSource, "No valid file found, using empty cache")
    } else {
        Logger.log(logSource, "No valid file found, not reloading cache")
    }

    return Logger.send(logSource, "stats", getCacheStats())
}

let invalidatedMainVersion = false

let saveCachedTimeout = undefined, saveCachedCount = 0
const currentlyLoadingCache = {}

/**
 * Save a file to cache
 * @param {string} cacheFile Location of where to cache file
 * @param {string} file File from URL
 * @param {string} url Full URL
 * @param {string} version Version tag from URL
 * @param {string} lastmodified Last modified in current cache
 * @param {Object} [headers] Headers to use in fetch
 */
async function cache(cacheFile, file, url, version, lastmodified, headers = {}) {
    if (currentlyLoadingCache[file])
        return await new Promise((resolve) => currentlyLoadingCache[file].push(resolve))

    currentlyLoadingCache[file] = []
    Logger.log(logSource, "Loading...", file)

    const response = (rep) => {
        currentlyLoadingCache[file].forEach(k => k(rep))
        delete currentlyLoadingCache[file]
        return rep
    }

    const options = { method: "GET", headers }

    // Request to only send full file if it has changed since last request
    if (lastmodified)
        options.headers["If-Modified-Since"] = lastmodified
    else
        delete options.headers["If-Modified-Since"]


    // Fetch data
    let data
    try {
        data = await fetch(url, options)
    } catch (error) {
        // Server denied request/network failed,
        if (lastmodified) {
            Logger.error(logSource, "Fetch failed, using cached version", error)
            Logger.addStatAndSend("blocked")
            invalidatedMainVersion = true

            return response({
                "status": 200,
                "contents": await readFile(cacheFile)
            })
        } else {
            Logger.error(logSource, "Fetch failed, no cached version", error)
            Logger.addStatAndSend("failed")

            return response({
                "status": 502,
                "contents": "The caching proxy was unable to handle your request and no cached version was available"
            })
        }
    }

    if (data.status == 304) {
        if (!lastmodified)
            // Not modified, but we don't have cached data to update
            return response({ "status": data.status })

        // If not modified, update version tag and send cached data
        Logger.log(logSource, "Not modified", file)
        Logger.addStatAndSend("notModified")

        if (cached[file].version != version) {
            cached[file].version = version
            queueCacheSave()
        }

        return response({
            "status": 200,
            "contents": await readFile(cacheFile)
        })
    }

    // Send cached data for forbidden requests.
    // This bypasses the foreign ip block added on 2020-02-25
    if (data.status == 403 && lastmodified) {
        Logger.log(logSource, "HTTP 403: Forbidden, using cached data")
        Logger.addStatAndSend("blocked")
        // Invalidate main.js and version.json versions since they might be outdated
        invalidatedMainVersion = true

        return response({
            "status": 200,
            "contents": await readFile(cacheFile)
        })
    }

    // These won't have useful responses
    if (data.status >= 400) {
        Logger.log(logSource, "HTTP error ", data.status, url)
        Logger.addStatAndSend("failed")

        if (lastmodified) {
            // When will/does this happen? File removed? But why would game try to access it then :thinking:
            Logger.log(logSource, "Cached version available for ", url)
            invalidatedMainVersion = true
            return response({
                "status": 200,
                "contents": await readFile(cacheFile)
            })
        }

        if (file == "/gadget_html5/js/kcs_const.js")
            Logger.send(logSource, "help", "gadgetFail")

        return response({
            status: data.status,
            contents: await data.buffer()
        })
    }

    // Store contents and meta-data
    const contents = await data.buffer()
    const rep = {
        "status": data.status,
        "contents": contents,
        "downloaded": true
    }
    Logger.addStatAndSend("fetched")

    const newCached = {
        "version": version,
        "lastmodified": data.headers.get("last-modified"),
        "length": (+data.headers.get("content-length")) || contents.length,
        "cache": data.headers.get("cache-control")
    }
    const queueSave = async () => {
        await ensureDir(dirname(cacheFile))

        if (await exists(cacheFile + ".tmp"))
            await remove(cacheFile + ".tmp")
        await writeFile(cacheFile + ".tmp", contents)
        if (await exists(cacheFile))
            await remove(cacheFile)
        await move(cacheFile + ".tmp", cacheFile)

        cached[file] = newCached
        queueCacheSave()

        Logger.log(logSource, "Saved", url)
        response(rep)
    }

    if (cached[file])
        cached[file].length = (+data.headers.get("content-length")) || contents.length

    // Metadata is written after writing file to prevent incorrectly loading wrong file (before written to disk)
    // Modder requires some of these
    if (getConfig().enableModder)
        await queueSave()
    else
        queueSave()

    return rep
}

/**
 * Send a file to user
 * @param {IncomingMessage} req Proxy request
 * @param {ServerResponse} res Proxy response
 * @param {string} cacheFile Cache file location
 * @param {string|Buffer} contents Contents of file, if undefined, will be loaded from cacheFile
 * @param {string} file File path
 * @param {any} cachedFile Cache metadata
 * @param {boolean} forceCache Bypass verification check, forcefully send cached file
 */
async function send(req, res, cacheFile, contents, file, cachedFile, forceCache = false) {
    if (!res) return

    if (contents == undefined)
        contents = await read(cacheFile)

    if (!forceCache && getConfig().verifyCache && cachedFile && cachedFile.length && contents.length != cachedFile.length) {
        Logger.error(logSource, cacheFile, "length doesn't match!", contents.length, cachedFile.length)
        Logger.addStatAndSend("bandwidthSaved", -contents.length)
        return handleCaching(req, res, true)
    }

    let gvo = getConfig().gameVersionOverwrite
    if (file) {
        const helpSends = {
            "/gadget_html5/js/kcs_const.js": "gadgetHit",
            "/kcs2/js/main.js": "mainHit",
            "/kcs2/version.json": "versionHit"
        }
        if (helpSends[file])
            Logger.send(logSource, "help", helpSends[file])

        if (file == "/gadget_html5/js/kcs_const.js" && gvo !== "false") {
            if (gvo == "kca")
                gvo = await getKCAVersion(getConfig().serverIP)

            if (gvo)
                contents = contents.toString().replace(/(scriptVe(r|)sion\s+?=\s+?)"(.*?)"/, `$1"${gvo}"`)
        }
    }

    if (file && getConfig().enableModder) {
        contents = await patch(file, contents, cacheFile, cachedFile)
    }

    if (file && isBlacklisted(file)) {
        res.setHeader("Server", "nginx")
        if (!cachedFile || cachedFile.cache == "no-cache" || cachedFile.cache == "no-store")
            res.setHeader("Cache-Control", "no-store")
        else
            res.setHeader("Cache-Control", "max-age=2592000, public, immutable")
    } else {
        // Copy KC server headers
        res.setHeader("Server", "nginx")
        res.setHeader("X-DNS-Prefetch-Control", "off")

        if (getConfig().disableBrowserCache || isInvalidated(file)) {
            res.setHeader("Cache-Control", "no-store")
            res.setHeader("Pragma", "no-cache")
        } else {
            res.setHeader("Cache-Control", "max-age=2592000, public, immutable")
            res.setHeader("Pragma", "public")
        }
    }

    // TODO switch or some table
    if (cacheFile.endsWith(".php") || cacheFile.endsWith(".html")) {
        res.setHeader("Content-Type", "text/html")
    } else if (cacheFile.endsWith(".png")) {
        res.setHeader("Content-Type", "image/png")
    } else if (cacheFile.endsWith(".json")) {
        res.setHeader("Content-Type", "application/json")
    } else if (cacheFile.endsWith(".css")) {
        res.setHeader("Content-Type", "text/css")
    } else if (cacheFile.endsWith(".mp3")) {
        res.setHeader("Accept-Ranges", "bytes")
        res.setHeader("Content-Type", "audio/mpeg")
    } else if (cacheFile.endsWith(".js")) {
        res.setHeader("Content-Type", "application/x-javascript")
    }

    res.end(contents)
}

/**
 * Handle caching of a request and send response
 * @param {IncomingMessage} req Request of user
 * @param {ServerResponse} res Response of server
 * @param {boolean} forceCache Bypass verification
 */
async function handleCaching(req, res, forceCache = false) {
    const { headers } = req
    let { url } = req
    if (url.startsWith("/"))
        url = `http://${headers.host}${url}`

    const { file, cacheFile, version } = extractURL(url)

    if (getConfig().bypassGadgetUpdateCheck)
        invalidatedMainVersion = true

    if (file.startsWith("/kcs2/") && !file.startsWith("/kcs2/resources/worldselect") && getConfig().serverIP !== headers.host) {
        if (!(headers.host == `127.0.0.1:${getConfig().port}` || headers.host == `${getConfig().hostname}:${getConfig().port}`
            || headers.host == "127.0.0.1" || headers.host == getConfig().hostname)) {
            getConfig().serverIP = headers.host
            Logger.log(logSource, `Detected KC server IP ${getConfig().serverIP}`)
            saveConfig()
        }
    }

    // Return cached if version matches
    const cachedFile = cached[file]
    let lastmodified = undefined
    if (cachedFile && await exists(cacheFile) && !forceCache) {
        // Allowing single ? for bugged _onInfoLoadComplete
        if ((cachedFile.version == version || version == "" || version == "?") && (getConfig().bypassGadgetUpdateCheck || !isBlacklisted(file)) && !isInvalidated(file)) {
            if (res == undefined)
                return
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
    if (res == undefined)
        return

    if (!result.contents) {
        res.statusCode = result.status
        return res.end()
    }

    if (result.status >= 400 && result.contents) {
        res.statusCode = result.status
        return res.end(result.contents)
    }

    if (!result.downloaded)
        Logger.addStatAndSend("bandwidthSaved", result.contents.length)
    return await send(req, res, cacheFile, result.contents, file, cached[file], forceCache)
}

async function getKCAVersion(host) {
    const url = `http://${host}/kca/version.json`
    const { file, cacheFile } = extractURL(url)

    Logger.addStatAndSend("totalHandled")

    const kcaFile = cached[file]
    let lastmodified = undefined
    if (kcaFile && await exists(cacheFile))
        lastmodified = kcaFile.lastmodified

    const result = await cache(cacheFile, file, url, "", lastmodified)

    if (!result.contents) return false
    if (result.status !== 200) return false

    try {
        return JSON.parse(result.contents.toString()).api.api_start2
    } catch (error) {
        return false
    }
}
/**
 * Parse an URL
 * @param {string} url URL to parse
 */
function extractURL(url) {
    let version = ""
    let file = "/" + url.match(/^(https?:\/\/.*?)?\/(.*)$/)[2]
    if (url.includes("?")) {
        version = url.substring(url.indexOf("?"))
        file = file.substring(0, file.indexOf("?"))
    }
    if (file.endsWith("/")) file += "index.html"

    const cacheFile = join(getCacheLocation(), file)
    return { file, cacheFile, version }
}

/**
 * Check if a file is blacklisted from cache
 * @param {string} file File to check
 */
function isBlacklisted(file) {
    return blacklisted.some(k => file.startsWith(k))
}

/**
 * Check if a file should be invalidated if blacklisted files didn't load
 * @param {string} file File to check
 */
function isInvalidated(file) {
    return invalidatedMainVersion && invalidated.some(k => file == k)
}

/**
 * Queue cache save
 */
function queueCacheSave() {
    if (++saveCachedCount < 25) {
        if (saveCachedTimeout)
            clearTimeout(saveCachedTimeout)
        saveCachedTimeout = setTimeout(forceSave, 5000)
    }
}

/**
 * Save cache and clear queued cache save
 */
async function forceSave() {
    if (saveCachedTimeout)
        clearTimeout(saveCachedTimeout)

    saveCachedTimeout = undefined
    saveCachedCount = 0
    await saveCached()
    saveCachedCount = 0
}

/**
 * Save cache
 */
async function saveCached() {
    const CACHE_INFORMATION = join(getCacheLocation(), "cached.json")
    const str = JSON.stringify(cached)
    if (str.length == 2)
        return Logger.log(logSource, `Cache is empty, not saved to ${CACHE_INFORMATION}`)

    await ensureDir(getCacheLocation())
    if (await exists(CACHE_INFORMATION)) {
        if (await exists(CACHE_INFORMATION + ".bak"))
            await remove(CACHE_INFORMATION + ".bak")
        await move(CACHE_INFORMATION, CACHE_INFORMATION + ".bak")
    }
    await writeFile(CACHE_INFORMATION, str)

    Logger.send(logSource, "stats", getCacheStats())
    Logger.log(logSource, `Saved cached to ${CACHE_INFORMATION}.`)
}
