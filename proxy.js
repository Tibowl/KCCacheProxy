const http = require("http")
const httpProxy = require("http-proxy")
const net = require("net")
const url = require("url")

const cacher = require("./cacher.js")
const { readFileSync, unlinkSync } = require("fs-extra")

const config = JSON.parse(readFileSync("./config.json"))
const { port, preloadOnStart } = config

const proxy = httpProxy.createProxyServer({})
const server = http.createServer(async (req, res) => {
    const {method, url} = req

    console.log(method + ": " + url)

    if(method !== "GET" || (!url.includes("/kcs/") && !url.includes("/kcs2/") && !url.includes("/kcscontents/") && !url.includes("/gadget_html5/")) || url.includes(".php"))
        return proxy.web(req, res, { target: `http://${req.headers.host}/` })

    return await cacher.handleCaching(req, res)
})

// https://github.com/http-party/node-http-proxy/blob/master/examples/http/reverse-proxy.js
server.on("connect", (req, socket) => {
    console.log(`${req.method}: ${req.url}`)
    const serverUrl = url.parse("https://" + req.url)
    const srvSocket = net.connect(serverUrl.port, serverUrl.hostname, () => {
        socket.on("error", (...a) => console.log("socket error", ...a))
        srvSocket.on("error", (...a) => console.log("srvsocket error", ...a))

        socket.write("HTTP/1.1 200 Connection Established\r\n" +
            "Proxy-agent: Node-Proxy\r\n" +
            "\r\n")

        srvSocket.pipe(socket)
        socket.pipe(srvSocket)
    })
})
server.on("error", (...a) => console.log("server error", ...a))
proxy.on("error", (...a) => console.log("proxy error", ...a))

console.log(`listening on port ${port}`)
server.listen(port)
if(preloadOnStart)
    require("./preload")

// Verify cache
if (process.argv.length > 2) {
    if(process.argv.find(k => k.toLowerCase() == "verifycache")) {
        if(!config.verifyCache) {
            console.error("verifyCache is not set in config! Aborted check!")
            return
        }
        console.log("Verifying cache... This might take a while")

        const deleteinvalid = process.argv.find(k => k.toLowerCase() == "delete")

        let total = 0, invalid = 0, checked = 0, error = 0
        Object.entries(cacher.cached).forEach(([key, value]) => {
            total++
            if(value.length == undefined) return

            try {
                const file = "./cache/" + key
                const contents = readFileSync(file)

                checked++
                if(contents.length != value.length) {
                    invalid++

                    console.error(key, "length doesn't match!", contents.length, value.length)
                    if(deleteinvalid)
                        unlinkSync(file)
                }
            } catch(e) {
                error++
            }
        })

        console.log(`Done verifying, found ${invalid} invalid files, ${checked} files checked, cached.json contains ${total} files, failed to check ${error} files (missing?)`)
    }
}
