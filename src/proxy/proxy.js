const http = require("http")
const https = require("https")
const { createProxyServer } = require("http-proxy")
const { connect } = require("net")
const { parse } = require("url")
const { join } = require("path")

const socks = require("node-socksv5-dns-looukp")

const cacher = require("./cacher")
const Logger = require("./ipc")
const logSource = "kccp-proxy"

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

        this.server = http.createServer(async (req, res) => {
            const { method } = req
             // strip the proxy address
            const oldPath = req.url.replace(/^(https?:\/\/[^\/]+)?(.*)$/, '$2')
            // if the path contains host information, convert it to an absolute url
            const newUrlStr = oldPath.replace(/^\/(https?)\//, '$1://')
            // if the path is relative, prepend the server address
            const base = `https://${this.config.serverIP}`
            const url = new URL(newUrlStr, base)

            
            if (req.headers) {
                delete req.headers.referer
                req.headers.host = url.host
            }
            
            Logger.log(logSource, `${method}: ${url}`)
            Logger.send(logSource, "help", "connected")

            if (method !== "GET" || (!KC_PATHS.some(path => url.pathname.includes(path))) || url.pathname.includes(".php")) {
                if (url.pathname.includes("/kcs2/index.php"))
                    Logger.send(logSource, "help", "indexHit")

                if ((url.hostname == '127.0.0.1' || url.hostname == 'localhost' || url.hostname == this.config.host)
                    && url.port == this.config.port) {
                    // don't allow loopback
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    return res.end('500 Unable to proxy this request.');
                }
                
                Logger.addStatAndSend("passthroughHTTP")
                Logger.addStatAndSend("passthrough")

                Logger.log(logSource, url.href)
                const isHttps = url.protocol === 'https:'
                const client = isHttps ? https : http
                const newReq = client.request({
                    hostname: url.hostname,
                    port: url.port || (isHttps ? 443 : 80),
                    path: url.pathname + url.search,
                    method: req.method,
                    headers: req.headers
                }, newRes => {
                    res.writeHead(newRes.statusCode, newRes.headers)
                    newRes.pipe(res, { end: true })
                })

                newReq.on('error', err => {
                    res.writeHead(502, { 'Content-Type': 'text/plain' })
                    res.end(`Error proxying request: ${err.message}`)
                })

                req.pipe(newReq, { end: true })
                return
            }

            Logger.addStatAndSend("totalHandled")
            return await cacher.handleCaching(req, res, url.href)
        })

        // https://github.com/http-party/node-http-proxy/blob/master/examples/http/reverse-proxy.js
        this.server.on("connect", (req, socket) => {
            Logger.log(logSource, `${req.method}: ${req.url}`)
            Logger.addStatAndSend("passthroughHTTPS")
            Logger.addStatAndSend("passthrough")

            socket.on("error", (...a) => Logger.error(logSource, "Socket error", ...a))

            const serverUrl = parse("https://" + req.url)
            const srvSocket = connect(serverUrl.port, serverUrl.hostname, () => {
                socket.write("HTTP/1.1 200 Connection Established\r\n" +
                    "Proxy-agent: Node-Proxy\r\n" +
                    "\r\n")

                srvSocket.pipe(socket)
                socket.pipe(srvSocket)
            })
            srvSocket.on("error", (...a) => Logger.error(logSource, "Server socket error", ...a))
        })
        this.server.on("error", async (...a) => {
            Logger.error(logSource, "Proxy server error", ...a)
            if (a[0].code === "EADDRINUSE") {
                if (this.closing) return
                setTimeout(() => {
                    this.server.listen(this.config.port, this.config.hostname)
                }, 5000)
            }
        })
        this.proxy.on("error", (error) => Logger.error(logSource, `Proxy error: ${error.code}: ${error.hostname}`))

        // SOCKS5 support
        if (this.config.socks5Enabled) {
            this.socksServer = new socks.Server({}, async function (info, accept, deny) {
                if (info.destination.host === config.getConfig().serverIP && info.destination.port === 80) {
                    Logger.log(logSource, `SOCKS5: ${info.destination.host}:${info.destination.port}`)
                    info.destination.host = this.config.hostname
                    info.destination.port = this.config.port
                }
                await accept()
            })

            if (this.config.socks5Users.length > 0) {
                this.socksServer.useAuth(socks.Auth.userPass(function (username, password) {
                    if (!username) {
                        Logger.error(logSource, "SOCKS5: No username provided.")
                        return Promise.reject()
                    }
                    const user = this.config.socks5Users.find(u => u.user === username)
                    if (!user) {
                        Logger.error(logSource, `SOCKS5: No user matching username ${username}.`)
                        return Promise.reject()
                    }
                    if (!user || user.password !== password) {
                        Logger.error(logSource, `SOCKS5: Password for user ${username} incorrect.`)
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
            Logger.log(logSource, `Starting proxy on ${this.config.hostname} with port ${this.config.port}...`)
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
                Logger.log(logSource, `SOCKS5 server listening on port ${this.config.socks5Port}`)
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
        Logger.log(logSource, "KCCacheProxy shutting down.")
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
