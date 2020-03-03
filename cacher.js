const fetch = require("node-fetch")
const { dirname } = require("path")
const { ensureDirSync, existsSync, renameSync, removeSync, readFileSync, writeFileSync } = require("fs-extra")
let config = {}
if(existsSync("./config.json"))
    config = JSON.parse(readFileSync("./config.json"))

const CACHE_LOCATION = "./cache/cached.json"

ensureDirSync("./cache/")
if(existsSync(CACHE_LOCATION + ".bak")) {
    if(existsSync(CACHE_LOCATION))
        removeSync(CACHE_LOCATION)
    renameSync(CACHE_LOCATION + ".bak", CACHE_LOCATION)
}

if(!existsSync(CACHE_LOCATION))
    writeFileSync(CACHE_LOCATION, "{}")
const cached = JSON.parse(readFileSync(CACHE_LOCATION))

let invalidatedMainVersion = false

let saveCachedTimeout = undefined, saveCachedCount = 0
const cache = async (cacheFile, file, url, version, lastmodified, headers = {}) => {
    console.log("Loading...", file)
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
            console.error("Fetch failed, using cached version", error)
            invalidatedMainVersion = true

            return {
                "status": 200,
                "contents": readFileSync(cacheFile)
            }
        } else {
            console.error("Fetch failed, no cached version", error)
            return {
                "status": 502,
                "contents": "The caching proxy was unable to handle your request and no cached version was available"
            }
        }
    }

    if(data.status == 304) {
        if(!lastmodified)
            // Not modified, but we don't have cached data to update
            return { "status": data.status }

        // If not modified, update version tag and send cached data
        console.log("Not modified", file)

        cached[file].version = version
        queueCacheSave()

        return {
            "status": 200,
            "contents": readFileSync(cacheFile)
        }
    }

    // Send cached data for forbidden requests.
    // This bypasses the foreign ip block added on 2020-02-25
    if(data.status == 403 && lastmodified) {
        console.log("HTTP 403: Forbidden, using cached data")
        // Invalidate main.js and version.json versions since they might be outdated
        invalidatedMainVersion = true

        return {
            "status": 200,
            "contents": readFileSync(cacheFile)
        }
    }

    // These won't have useful responses
    if(data.status >= 400) {
        console.log("HTTP error ", data.status, url)
        return data
    }

    // Store contents and meta-data
    const contents = await data.buffer()

    ensureDirSync(dirname(cacheFile))

    if(existsSync(cacheFile + ".tmp"))
        removeSync(cacheFile + ".tmp")
    writeFileSync(cacheFile + ".tmp", contents)
    if(existsSync(cacheFile))
        removeSync(cacheFile)
    renameSync(cacheFile + ".tmp", cacheFile)

    cached[file] = {
        "version": version,
        "lastmodified": data.headers.get("last-modified"),
        "cache": data.headers.get("cache-control")
    }
    queueCacheSave()

    console.log("Saved", url)
    return {
        "status": data.status,
        "contents": contents
    }
}

const send = (res, cacheFile, contents, file, cachedFile) => {
    if (res) {
        if(contents == undefined)
            contents = readFileSync(cacheFile)

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

            if(config.disableBrowserCache || isInvalidated(file)) {
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

const handleCaching = async (req, res) => {
    const { url, headers } = req
    const { file, cacheFile, version } = extractURL(url)

    // Return cached if version matches
    const cachedFile = cached[file]
    let lastmodified = undefined
    if(cachedFile && existsSync(cacheFile)) {
        // Allowing single ? for bugged _onInfoLoadComplete
        if((cachedFile.version == version || version == "" || version == "?") && !isBlacklisted(file) && !isInvalidated(file))
            return send(res, cacheFile, undefined, file, cachedFile)

        // Version doesn't match, lastmodified set
        lastmodified = cachedFile.lastmodified
    }

    // Not in cache or version mismatch, need to check with server
    const result = await cache(cacheFile, file, url, version, lastmodified, headers)

    if(!result.contents && res) {
        res.statusCode = result.status
        return res.end()
    }

    if(result.status >= 500 && result.contents && res) {
        res.statusCode = result.status
        return res.end(result.contents)
    }

    return send(res, cacheFile, result.contents, file, cachedFile)
}

const extractURL = (url) => {
    let version = ""
    let file = "/" + url.match(/^https?:\/\/\d+\.\d+\.\d+\.\d+\/(.*)$/)[1]
    if (url.includes("?")) {
        version = url.substring(url.indexOf("?"))
        file = file.substring(0, file.indexOf("?"))
    }
    if(file.endsWith("/")) file += "index.html"
    const cacheFile = "./cache/" + file
    return { file, cacheFile, version }
}

module.exports = { cache, handleCaching , extractURL}
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
        saveCachedTimeout = setTimeout(() => {
            saveCachedTimeout = undefined
            saveCached()
            saveCachedCount = 0
        }, 5000)
    }
}

function saveCached() {
    renameSync(CACHE_LOCATION, CACHE_LOCATION + ".bak")
    writeFileSync(CACHE_LOCATION, JSON.stringify(cached))
    removeSync(CACHE_LOCATION + ".bak")
    console.log("Saved cache.")
}
