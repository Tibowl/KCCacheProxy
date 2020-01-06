const http = require("http")
const httpProxy = require("http-proxy")
const { ensureDirSync, existsSync, readFileSync, writeFileSync } = require("fs-extra")
const fetch = require("node-fetch")
const path = require("path")

const port = 8081

ensureDirSync("./cache/")
if(!existsSync("./cache/cached.json"))
    writeFileSync("./cache/cached.json", "{}")
const cached = require("./cache/cached.json")

const proxy = httpProxy.createProxyServer({})
const cache = async (res, file, url, version) => {
    console.log("Caching", file)
    const data = await fetch(url)
    console.log(url, data.status)
    if(data.status >= 400) {
        console.log("Didn't find ", url)
        res.statusCode = data.status
        return res.end()
    }

    const contents = await data.buffer()

    const cacheFile = "./cache/" + file
    ensureDirSync(path.dirname(cacheFile))
    writeFileSync(cacheFile, contents)

    cached[file] = {
        "version": version,
        "lastmodified": data.headers.get("last-modified")
    }
    writeFileSync("./cache/cached.json", JSON.stringify(cached))
    console.log("Cached", url)
    return res.end(readFileSync(cacheFile))
}
const server = http.createServer(async (req, res) => {

    const {method, url} = req

    console.log(method + ": " + url)

    const server = req.headers.host

    if(method !== "GET" || !url.includes("/kcs") || url.includes(".php"))
        return proxy.web(req, res, { target: `http://${server}/` })

    let version = ""
    let file = url.substring(url.indexOf("/kcs"))
    if(url.includes("?")) {
        version = url.substring(url.indexOf("?"))
        file = file.substring(0, file.indexOf("?"))
    }
    const cacheFile = "./cache/" + file

    // Return cached if version matches
    const cachedFile = cached[file]
    if(cachedFile && existsSync(cacheFile)) {
        if(cachedFile.version == version)
            return res.end(readFileSync(cacheFile))

        // Version changed
        const options = {method: "HEAD", host: server, port: 80, path: file}
        console.log(options)
        const req = http.request(options, async function(head) {
            if (head.statusCode != 200) {
                res.statusCode = head.statusCode
                return res.end()
            } else if (head.headers["last-modified"] == cachedFile.lastmodified) {
                console.log("Version changed, but not last modified")

                cached[file].version = version
                writeFileSync("./cache/cached.json", JSON.stringify(cached))

                return res.end(readFileSync(cacheFile))
            } else
                return await cache(res, file, url, version)
        })
        req.end()
        return
    }

    // Not in cache
    return await cache(res, file, url, version)
})

console.log(`listening on port ${port}`)
server.listen(port)
