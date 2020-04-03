const http = require("http")
const httpProxy = require("http-proxy")
const net = require("net")
const url = require("url")

const { mapLimit } = require("async")
const { readFileSync, readFile, unlink } = require("fs-extra")

const cacher = require("./cacher.js")
const Logger = require("./logger")

const config = JSON.parse(readFileSync("./config.json"))
const { port, preloadOnStart } = config

const KC_PATHS = ["/kcs/", "/kcs2/", "/kcscontents/", "/gadget_html5/", "/html/"]

const proxy = httpProxy.createProxyServer({})
const server = http.createServer(async (req, res) => {
    const { method, url } = req

    Logger.log(method + ": " + url)

    if(method !== "GET" || (!KC_PATHS.some(path => url.includes(path))) || url.includes(".php"))
        return proxy.web(req, res, {
            target: `http://${req.headers.host}/`,
            timeout:  config.timeout
        })

    return await cacher.handleCaching(req, res)
})

// https://github.com/http-party/node-http-proxy/blob/master/examples/http/reverse-proxy.js
server.on("connect", (req, socket) => {
    Logger.log(`${req.method}: ${req.url}`)

    socket.on("error", (...a) => Logger.error("Socket error", ...a))

    const serverUrl = url.parse("https://" + req.url)
    const srvSocket = net.connect(serverUrl.port, serverUrl.hostname, () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n" +
            "Proxy-agent: Node-Proxy\r\n" +
            "\r\n")

        srvSocket.pipe(socket)
        socket.pipe(srvSocket)
    })
    srvSocket.on("error", (...a) => Logger.error("Srvsocket error", ...a))
})
server.on("error", (...a) => Logger.error("Server error", ...a))
proxy.on("error", (error) => Logger.error(`Proxy error: ${error.code}: ${error.hostname}`))

const main = async () => {
    // Verify cache
    if (process.argv.length > 2) {
        if(process.argv.find(k => k.toLowerCase() == "verifycache")) {
            if(!config.verifyCache) {
                Logger.error("verifyCache is not set in config! Aborted check!")
                return
            }
            Logger.log("Verifying cache... This might take a while")

            const deleteinvalid = process.argv.find(k => k.toLowerCase() == "delete")

            const responses = await mapLimit(
                Object.entries(cacher.cached),
                32,
                async ([key, value]) =>  {
                    try {
                        if(value.length == undefined) return 0
                        const file = "./cache/" + key
                        const contents = await readFile(file)

                        if(contents.length != value.length) {
                            Logger.error(key, "length doesn't match!", contents.length, value.length)
                            if(deleteinvalid)
                                unlink(file)
                            return 0
                        }
                        return 1
                    } catch(e) {
                        return -1
                    }
                }
            )

            const total = responses.length,
                  invalid = responses.filter(k => k == 0).length,
                  checked = responses.filter(k => k >= 0).length,
                  error   = responses.filter(k => k == -1).length

            Logger.log(`Done verifying, found ${invalid} invalid files, ${checked} files checked, cached.json contains ${total} files, failed to check ${error} files (missing?)`)
        }
    }
}

Logger.log(`listening on port ${port}`)
server.listen(port)
if(preloadOnStart)
    require("./preload")
main()
