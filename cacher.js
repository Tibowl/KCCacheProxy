const fetch = require("node-fetch")
const path = require("path")
const { ensureDirSync, existsSync, renameSync, removeSync, readFileSync, writeFileSync } = require("fs-extra")
const config = require("./config.json")

const CACHE_LOCATION = "./cache/cached.json"

ensureDirSync("./cache/")
if(existsSync(CACHE_LOCATION + ".bak")) {
    if(existsSync(CACHE_LOCATION))
        removeSync(CACHE_LOCATION)
    renameSync(CACHE_LOCATION + ".bak", CACHE_LOCATION)
}

if(!existsSync(CACHE_LOCATION))
    writeFileSync(CACHE_LOCATION, "{}")
const cached = require(CACHE_LOCATION)

let saveCachedTimeout = undefined, saveCachedCount = 0
const cache = async (cacheFile, file, url, version, lastmodified, headers = {}) => {
    console.log("Loading...", file)
    const options = { method: "GET", headers }
    if(lastmodified)
        options.headers["If-Modified-Since"] = lastmodified
    else
        delete options.headers["If-Modified-Since"]

    const data = await fetch(url, options)
    if(data.status == 304) {
        console.log("Not modified", file)

        cached[file].version = version
        queueCacheSave()

        return {
            "status": 200,
            "contents": readFileSync(cacheFile)
        }
    }

    if(data.status >= 400) {
        console.log("Didn't find ", url)
        return data
    }

    const contents = await data.buffer()

    ensureDirSync(path.dirname(cacheFile))

    if(existsSync(cacheFile + ".tmp"))
        removeSync(cacheFile + ".tmp")
    writeFileSync(cacheFile + ".tmp", contents)
    if(existsSync(cacheFile))
        removeSync(cacheFile)
    renameSync(cacheFile + ".tmp", cacheFile)

    cached[file] = {
        "version": version,
        "lastmodified": data.headers.get("last-modified")
    }

    queueCacheSave()

    console.log("Saved", url)
    return {
        "status": data.status,
        "contents": contents
    }
}

const send = (res, cacheFile, contents) => {
    if (res) {
        if(contents == undefined)
            contents = readFileSync(cacheFile)

        if(config.disableBrowserCache) {
            res.setHeader("Cache-Control", "no-store")
            res.setHeader("Pragma", "no-cache")
        } else {
            res.setHeader("Cache-Control", "max-age=2592000, public, immutable")
            res.setHeader("Pragma", "public")
        }

        if(cacheFile.endsWith(".php"))
            res.setHeader("Content-Type", "html")
        else if(cacheFile.endsWith(".png"))
            res.setHeader("Content-Type", "image/png")
        else if(cacheFile.endsWith(".json"))
            res.setHeader("Content-Type", "application/json")
        else if(cacheFile.endsWith(".css"))
            res.setHeader("Content-Type", "text/css")
        else if(cacheFile.endsWith(".mp3"))
            res.setHeader("Content-Type", "audio/mpeg")

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
        if(cachedFile.version == version || version == "")
            return send(res, cacheFile)

        // Version doesn't match, lastmodified set
        lastmodified = cachedFile.lastmodified
    }

    // Not in cache or version mismatch, need to check with server
    const result = await cache(cacheFile, file, url, version, lastmodified, headers)

    if(!result.contents && res) {
        res.statusCode = result.status
        return res.end()
    }

    return send(res, cacheFile, result.contents)
}
const extractURL = (url) => {
    let version = ""
    let file = url.substring(url.indexOf("/kcs"))
    if (url.includes("?")) {
        version = url.substring(url.indexOf("?"))
        file = file.substring(0, file.indexOf("?"))
    }
    const cacheFile = "./cache/" + file
    return { file, cacheFile, version }
}

module.exports = { cache, handleCaching , extractURL}

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
