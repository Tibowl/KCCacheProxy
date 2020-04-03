const { existsSync, readFileSync, writeFileSync, ensureDirSync } = require("fs-extra")
const { join, dirname } = require("path")

const Logger = require("./logger")

const defaultConfig = {
    "port": 8081,
    "cacheLocation": "default",
    "disableBrowserCache": false,
    "verifyCache": false,
    "serverID": 0,
    "preloadOnStart": false,
    "preloader": {
        "maxSimulPreload": 4,
        "recommended": {
            "static": true,
            "assets": true,
            "servername": true,
            "maps": true,
            "useitem": true,
            "gadget": false
        },
        "sounds": {
            "titlecalls": false,
            "se": false,
            "bgm": false,
            "npcvoices": false,
            "voices": false
        },
        "extra": {
            "equips": false,
            "furniture": false,
            "ships": false
        },
        "cleanup": true
    }
}

let config = existsSync("./config.json") ? Object.assign({}, defaultConfig, JSON.parse(readFileSync("./config.json"))) : defaultConfig

let app = undefined
function loadConfig(electronApp) {
    app = electronApp // Prevent compiling electron stuff in small versions

    const userdata = join(app.getPath("userData"), "ProxyData")
    const configLocation = join(userdata, "config.json")

    Logger.log(`Loading config from: ${configLocation}`)

    if (existsSync(configLocation))
        config = Object.assign({}, defaultConfig, JSON.parse(readFileSync(configLocation)))
    else
        config = defaultConfig

    if (config.cacheLocation == undefined || config.cacheLocation == "default")
        config.cacheLocation = join(userdata, "cache")

    Logger.log(`Cache location is at: ${config.cacheLocation}`)
}

function saveConfig() {
    let configLocation
    if(app) {
        const userdata = join(app.getPath("userData"), "ProxyData")
        configLocation = join(userdata, "config.json")
    } else {
        configLocation = "./config.json"
    }

    ensureDirSync(dirname(configLocation))
    writeFileSync(configLocation, JSON.stringify(getConfig(), undefined, 4))
}
function preloader() {
    if(config == defaultConfig)
        config = {serverID: -1, preloader: {recommended: { gadget: true }}}
}

function getConfig() {
    return config
}

function getCacheLocation() {
    if (config.cacheLocation == undefined || config.cacheLocation == "default")
        return "./cache/"

    return config.cacheLocation
}

module.exports = { getConfig, getCacheLocation, loadConfig, saveConfig, preloader }
