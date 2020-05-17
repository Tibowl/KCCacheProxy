const { createServer } = require("http")
const { createProxyServer } = require("http-proxy")
const { connect } = require("net")
const { parse } = require("url")

const cacher = require("./cacher")
const Logger = require("./ipc")

const { verifyCache } = require("./cacheHandler")
const { getConfig } = require("./config")
const { hostname, port, preloadOnStart, enableModder } = getConfig()
const { reloadModCache } = require("./mod/patcher")

const KC_PATHS = ["/kcs/", "/kcs2/", "/kcscontents/", "/gadget_html5/", "/html/", "/kca/"]

const proxy = createProxyServer()
const server = createServer(async (req, res) => {
    const { method, url } = req

    Logger.log(method + ": " + url)
    Logger.send("help", "connected")

    if (method !== "GET" || (!KC_PATHS.some(path => url.includes(path))) || url.includes(".php")) {
        if (url.includes("/kcs2/index.php"))
            Logger.send("help", "indexHit")
        Logger.addStatAndSend("passthroughHTTP")
        Logger.addStatAndSend("passthrough")
        return proxy.web(req, res, {
            target: `http://${req.headers.host}/`,
            timeout: getConfig().timeout
        })
    }

    Logger.addStatAndSend("totalHandled")
    return await cacher.handleCaching(req, res)
})

// https://github.com/http-party/node-http-proxy/blob/master/examples/http/reverse-proxy.js
server.on("connect", (req, socket) => {
    Logger.log(`${req.method}: ${req.url}`)
    Logger.addStatAndSend("passthroughHTTPS")
    Logger.addStatAndSend("passthrough")

    socket.on("error", (...a) => Logger.error("Socket error", ...a))

    const serverUrl = parse("https://" + req.url)
    const srvSocket = connect(serverUrl.port, serverUrl.hostname, () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n" +
            "Proxy-agent: Node-Proxy\r\n" +
            "\r\n")

        srvSocket.pipe(socket)
        socket.pipe(srvSocket)
    })
    srvSocket.on("error", (...a) => Logger.error("Srvsocket error", ...a))
})
server.on("error", (...a) => Logger.error("Proxy server error", ...a))
proxy.on("error", (error) => Logger.error(`Proxy error: ${error.code}: ${error.hostname}`))

const main = async () => {
    cacher.loadCached()
    if (Logger.getStatsPath() == undefined)
        Logger.setStatsPath("./stats.json")

    Logger.log(`Starting proxy on ${hostname} with port ${port}...`)
    server.listen(port, hostname)

    if (preloadOnStart)
        require("./preload").run()

    // Verify cache
    if (process.argv.length > 2) {
        if (process.argv.find(k => k.toLowerCase() == "verifycache"))
            verifyCache()
    }

    if (enableModder) setTimeout(() => {
        reloadModCache()
    }, 1000)
}

main()
