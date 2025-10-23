const http = require("http")
const https = require("https")
const { createProxyServer } = require("http-proxy")
const { connect } = require("net")
const { parse } = require("url")
const { join } = require("path")

const socks = require("node-socksv5-dns-looukp")

const cacher = require("./cacher")
const Logger = require("./ipc")
const kccpLogSource = "kccp-proxy"

const { verifyCache } = require("./cacheHandler")
const config = require("./config")
const { reloadModCache } = require("./mod/patcher")
const { Readable } = require("stream")

const KC_PATHS = ["/kcs/", "/kcs2/", "/kcscontents/", "/gadget_html5/", "/html/", "/kca/"]


class Proxy {
    constructor() {
    }

    async init() {
        this.closing = false

        this.config = config.getConfig()

        this.proxy = createProxyServer()

        this.server = http.createServer((req, res) => {
            this.proxyRequest({
                method: req.method,
                headers: req.headers,
                url: req.url,
                bodyStream: req
            },
            ({ statusCode, headers, data }) => {
                res.writeHead(statusCode || 500, headers || {})
                data.pipe(res, { end: true })
            })
        })

        // https://github.com/http-party/node-http-proxy/blob/master/examples/http/reverse-proxy.js
        this.server.on("connect", (req, socket) => {
            Logger.log(kccpLogSource, `${req.method}: ${req.url}`)
            Logger.addStatAndSend("passthroughHTTPS")
            Logger.addStatAndSend("passthrough")

            socket.on("error", (...a) => Logger.error(kccpLogSource, "Socket error", ...a))

            const serverUrl = parse("https://" + req.url)
            const srvSocket = connect(serverUrl.port, serverUrl.hostname, () => {
                socket.write("HTTP/1.1 200 Connection Established\r\n" +
                    "Proxy-agent: Node-Proxy\r\n" +
                    "\r\n")

                srvSocket.pipe(socket)
                socket.pipe(srvSocket)
            })
            srvSocket.on("error", (...a) => Logger.error(kccpLogSource, "Server socket error", ...a))
        })
        this.server.on("error", async (...a) => {
            Logger.error(kccpLogSource, "Proxy server error", ...a)
            if (a[0].code === "EADDRINUSE") {
                if (this.closing) return
                setTimeout(() => {
                    this.server.listen(this.config.port, this.config.hostname)
                }, 5000)
            }
        })
        this.proxy.on("error", (error) => Logger.error(kccpLogSource, `Proxy error: ${error.code}: ${error.hostname}`))

        // SOCKS5 support
        if (this.config.socks5Enabled) {
            this.socksServer = new socks.Server({}, async function (info, accept, _) {
                if (info.destination.host === config.getConfig().serverIP && info.destination.port === 80) {
                    Logger.log(kccpLogSource, `SOCKS5: ${info.destination.host}:${info.destination.port}`)
                    info.destination.host = this.config.hostname
                    info.destination.port = this.config.port
                }
                await accept()
            })

            if (this.config.socks5Users.length > 0) {
                this.socksServer.useAuth(socks.Auth.userPass(function (username, password) {
                    if (!username) {
                        Logger.error(kccpLogSource, "SOCKS5: No username provided.")
                        return Promise.reject()
                    }
                    const user = this.config.socks5Users.find(u => u.user === username)
                    if (!user) {
                        Logger.error(kccpLogSource, `SOCKS5: No user matching username ${username}.`)
                        return Promise.reject()
                    }
                    if (!user || user.password !== password) {
                        Logger.error(kccpLogSource, `SOCKS5: Password for user ${username} incorrect.`)
                        return Promise.reject()
                    }
                    return Promise.resolve()
                }))
            } else {
                this.socksServer.useAuth(socks.Auth.none())
            }
        }
    }

    async proxyRequest({ method, headers, url, bodyStream }, callback) {
        const respondWithError = function (code, error) {
            callback({
                statusCode: code,
                headers: { "Content-Type": "text/plain" },
                data: Readable.from([error])
            })
        }

        // strip the proxy address and rebuild the URL
        // shorten URLs like /https/domain.com/some/path
        // scheme is optional, will assume https
        // subdomains can be used for kancolle-server.com
        // e.g. /w00g/some/path
        const getNewUrl = function (oldUrl) {
            const matches = oldUrl.match(/^(\/(https?)|(https?):\/)\/((w[0-2]\d\w)(?:\.kancolle-server\.com)?|[^/]+)(\/.*)?/)
            if (!matches)
                return oldUrl
            const newUrlStr = `${matches[2]||matches[3]||'https'}://${matches[5]?matches[5]+'.kancolle-server.com':matches[4]}${matches[6]}`
            // if the path is relative, prepend the server address
            return newUrlStr
        }
        
        const base = `https://${this.config.serverIP}`

        url = new URL(getNewUrl(url), base)

        // adjust headers
        if (headers) {
            const replace = ["origin", "referer"]
            replace.forEach(r => {
                if (headers[r])
                    headers[r] = getNewUrl(headers[r])
            })
            headers.host = url.host

            const kcpHeaders = ["x-kcp-host", "x-host"]
            const hostHeader = kcpHeaders.find(x => !!headers[x])
            if (hostHeader) {
                headers.host = headers[hostHeader]
                url.host = headers[hostHeader]
            }
            kcpHeaders.forEach(x => delete headers[x])
        }

        Logger.log(kccpLogSource, `${method}: ${url}`)
        Logger.send(kccpLogSource, "help", "connected")

        if (method !== "GET" || (!KC_PATHS.some(path => url.pathname.includes(path))) || url.pathname.includes(".php")) {
            if (url.pathname.includes("/kcs2/index.php"))
                Logger.send(kccpLogSource, "help", "indexHit")

            if ((url.hostname == "127.0.0.1" || url.hostname == "localhost" || url.hostname == this.config.host)
                && url.port == this.config.port) {
                // don't allow loopback
                respondWithError(500, "Attempted to proxy a loopback connection.")
                return
            }

            Logger.addStatAndSend("passthroughHTTP")
            Logger.addStatAndSend("passthrough")

            const isHttps = url.protocol === "https:"
            const client = isHttps ? https : http
            const newReq = client.request(url, { method, headers },
                newRes => callback({
                    statusCode: newRes.statusCode,
                    headers: newRes.headers,
                    data: newRes
                })
            )

            newReq.on("error", err => {
                const message = `Error proxying request: ${err.message}`
                Logger.send(kccpLogSource, message)
                respondWithError(502, message)
            })

            if (bodyStream)
                bodyStream.pipe(newReq, { end: true })
            else newReq.end()
            return
        }

        Logger.addStatAndSend("totalHandled")
        const res = { statusCode: 200, headers: {} }
        await cacher.handleCaching({ method, headers, url: url.href, bodyStream }, res)
        res.data = Readable.from(res.data || [])
        callback(res)
    }


    async start() {
        cacher.loadCached()

        if (Logger.getStatsPath() == undefined) {
            const dir = process.env.DATA_DIR || "."
            const filePath = join(dir, "stats.json")
            Logger.setStatsPath(filePath)
        }

        const listen = () => {
            Logger.log(kccpLogSource, `Starting proxy on ${this.config.hostname} with port ${this.config.port}...`)
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
                Logger.log(kccpLogSource, `SOCKS5 server listening on port ${this.config.socks5Port}`)
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
        Logger.log(kccpLogSource, "KCCacheProxy shutting down.")
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
    module.exports = { Proxy, config, logger: Logger, kccpLogSource }
}
