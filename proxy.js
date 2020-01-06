const http = require("http")
const httpProxy = require("http-proxy")

const cacher = require("./cacher.js")
const config = require("./config.json")
const { port } = config

const proxy = httpProxy.createProxyServer({})
const server = http.createServer(async (req, res) => {
    const {method, url} = req

    console.log(method + ": " + url)

    if(method !== "GET" || (!url.includes("/kcs/") && !url.includes("/kcs2/")) || url.includes(".php"))
        return proxy.web(req, res, { target: `http://${req.headers.host}/` })

    return await cacher.handleCaching(req, res)
})

console.log(`listening on port ${port}`)
server.listen(port)
