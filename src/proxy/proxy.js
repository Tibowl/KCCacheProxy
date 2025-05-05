const { createServer } = require("http")
const { createProxyServer } = require("http-proxy")
const { connect } = require("net")
const { parse } = require("url")
const { join } = require("path")

const socks = require("node-socksv5-dns-looukp")

const cacher = require("./cacher")
const Logger = require("./ipc")

const { verifyCache } = require("./cacheHandler")
const config = require("./config")
const { reloadModCache } = require("./mod/patcher")

const KC_PATHS = ["/kcs/", "/kcs2/", "/kcscontents/", "/gadget_html5/", "/html/", "/kca/"]


class Proxy {
    constructor() {
    }

    async init() {
        this.closing = false

        this.config = config.getConfig()

        this.proxy = createProxyServer()

        this.server = createServer(async (req, res) => {
            const { method, url } = req

            Logger.log(`${method}: ${url}`)
            Logger.send("help", "connected")

            if (method !== "GET" || (!KC_PATHS.some(path => url.includes(path))) || url.includes(".php")) {
                if (url.includes("/kcs2/index.php"))
                    Logger.send("help", "indexHit")

                if (req.headers.host == `127.0.0.1:${this.config.port}` || req.headers.host == `${this.config.hostname}:${this.config.port}`
                    || req.headers.host == "127.0.0.1" || req.headers.host == this.config.hostname)
                    return res.end(500)

                Logger.addStatAndSend("passthroughHTTP")
                Logger.addStatAndSend("passthrough")

                return this.proxy.web(req, res, {
                    target: `http://${req.headers.host}/`,
                    timeout: config.getConfig().timeout
                })
            }

            Logger.addStatAndSend("totalHandled")
            return await cacher.handleCaching(req, res)
        })

        // https://github.com/http-party/node-http-proxy/blob/master/examples/http/reverse-proxy.js
        this.server.on("connect", (req, socket) => {
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
            srvSocket.on("error", (...a) => Logger.error("Server socket error", ...a))
        })
        this.server.on("error", async (...a) => {
            Logger.error("Proxy server error", ...a)
            if (a[0].code === "EADDRINUSE") {
                if (this.closing) return
                setTimeout(() => {
                    this.server.listen(this.config.port, this.config.hostname)
                }, 5000)
            }
        })
        this.proxy.on("error", (error) => Logger.error(`Proxy error: ${error.code}: ${error.hostname}`))

        // SOCKS5 support
        if (this.config.socks5Enabled) {
            this.socksServer = new socks.Server({}, async function (info, accept, deny) {
                if (info.destination.host === config.getConfig().serverIP && info.destination.port === 80) {
                    Logger.log(`SOCKS5: ${info.destination.host}:${info.destination.port}`)
                    info.destination.host = this.config.hostname
                    info.destination.port = this.config.port
                }
                await accept()
            })

            if (this.config.socks5Users.length > 0) {
                this.socksServer.useAuth(socks.Auth.userPass(function (username, password) {
                    if (!username) {
                        Logger.error("SOCKS5: No username provided.")
                        return Promise.reject()
                    }
                    const user = this.config.socks5Users.find(u => u.user === username)
                    if (!user) {
                        Logger.error(`SOCKS5: No user matching username ${username}.`)
                        return Promise.reject()
                    }
                    if (!user || user.password !== password) {
                        Logger.error(`SOCKS5: Password for user ${username} incorrect.`)
                        return Promise.reject()
                    }
                    return Promise.resolve()
                }))
            } else {
                this.socksServer.useAuth(socks.Auth.none())
            }
        }
    }

    async start() {
        cacher.loadCached()

        if (Logger.getStatsPath() == undefined) {
            const dir = process.env.DATA_DIR || "."
            const filePath = join(dir, "stats.json")
            Logger.setStatsPath(filePath)
        }

        const listen = () => {
            Logger.log(`Starting proxy on ${this.config.hostname} with port ${this.config.port}...`)
            this.server.listen(this.config.port, this.config.hostname)
        }

        if (this.config.enableModder) {
            setImmediate(async () => {
                await reloadModCache()
                listen()
            })
        } else {
            listen()
        }

        if (this.socksServer) {
            this.socksServer.listen(this.config.socks5Port, this.config.hostname, function () {
                Logger.log(`SOCKS5 server listening on port ${this.config.socks5Port}`)
            })
        }

        if (this.config.preloadOnStart)
            require("./preload").run()

        // Verify cache
        if (process.argv.length > 2) {
            if (process.argv.find(k => k.toLowerCase() == "verifycache"))
                verifyCache()
        }
    }

    close() {
        Logger.log("KCCacheProxy shutting down.")
        this.closing = true
        if (this.proxy)
            this.proxy.close()
        if (this.server)
            this.server.close()
    }
}

if (require.main === module) {
    const proxy = new Proxy()
    proxy.init()
    proxy.start()
} else {
    module.exports = { Proxy, config, logger: Logger }
}
