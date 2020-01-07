const http = require("http")
const fetch = require("node-fetch")
const path = require("path")
const { ensureDirSync, existsSync, renameSync, removeSync, readFileSync, writeFileSync } = require("fs-extra")

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
const cache = async (cacheFile, file, url, version) => {
    console.log("Caching...", file)
    const data = await fetch(url)
    if(data.status >= 400) {
        console.log("Didn't find ", url)
        return data.status
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

    if(++saveCachedCount < 25) {
        if(saveCachedTimeout)
            clearTimeout(saveCachedTimeout)

        saveCachedTimeout = setTimeout(() => {
            saveCachedTimeout = undefined
            saveCached()
            saveCachedCount = 0
        }, 10000)
    }

    console.log("Cached!", url)
    return 200
}

const setHeaders = (res) => {
    res.setHeader("Cache-Control", "max-age=2592000, public, immutable")
    res.setHeader("Pragma", "public")
}

const handleCaching = async (req, res, disableLoading = false) =>{
    const {url} = req
    const server = req.headers.host

    const { file, cacheFile, version } = extractURL(url)

    // Return cached if version matches
    const cachedFile = cached[file]
    if(cachedFile && existsSync(cacheFile)) {
        if(cachedFile.version == version) {
            if(!disableLoading) {
                setHeaders(res)
                return res.end(readFileSync(cacheFile))
            }
            return
        }

        // Version changed
        return await new Promise((reslove) => {
            const options = {method: "HEAD", host: server, port: 80, path: file}
            const req = http.request(options, async function(head) {
                if (head.statusCode != 200) {
                    res.statusCode = head.statusCode
                    res.end()
                    reslove()
                } else if (head.headers["last-modified"] == cachedFile.lastmodified) {
                    console.log("Version changed, but not last modified")

                    cached[file].version = version
                    writeFileSync(CACHE_LOCATION, JSON.stringify(cached))

                    if(!disableLoading) {
                        setHeaders(res)
                        res.end(readFileSync(cacheFile))
                    }
                    reslove()
                } else {
                    console.log("Version & last modified changed!")
                    await cache(cacheFile, file, url, version)
                    reslove()
                }
            })
            req.end()
        })
    }

    // Not in cache
    const result = await cache(cacheFile, file, url, version)

    if(result >= 400) {
        res.statusCode = result
        return res.end()
    }
    if(!disableLoading) {
        setHeaders(res)
        return res.end(readFileSync(cacheFile))
    }
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
function saveCached() {
    renameSync(CACHE_LOCATION, CACHE_LOCATION + ".bak")
    writeFileSync(CACHE_LOCATION, JSON.stringify(cached))
    removeSync(CACHE_LOCATION + ".bak")
    console.log("Saved cache.")
}
