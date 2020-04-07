const { existsSync, readFileSync, writeFileSync, ensureDirSync } = require("fs-extra")
const { join, dirname } = require("path")

module.exports = { getConfig, getCacheLocation, loadConfig, saveConfig, setConfig, preloader }

const Logger = require("./ipc")
const { forceSave, loadCached } = require("./cacher")

const defaultConfig = {
    "port": 8081,
    "cacheLocation": "default",
    "startHidden": false,
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
    },
    "configVersion": 2
}

let config = existsSync("./config.json") ? Object.assign({}, defaultConfig, JSON.parse(readFileSync("./config.json"))) : defaultConfig
let cacheLocation = config.cacheLocation

let app = undefined, userdata = "."
function loadConfig(electronApp) {
    app = electronApp // Prevent compiling electron stuff in small versions

    userdata = join(app.getPath("userData"), "ProxyData")
    const configLocation = join(userdata, "config.json")

    Logger.log(`Loading config from: ${configLocation}`)

    if (existsSync(configLocation))
        config = Object.assign({}, defaultConfig, JSON.parse(readFileSync(configLocation)))
    else
        config = defaultConfig

    setConfig(config)
}

function saveConfig() {
    const configLocation = join(userdata, "config.json")
    Logger.log(`Saving config to ${configLocation}`)

    ensureDirSync(dirname(configLocation))
    writeFileSync(configLocation, JSON.stringify(getConfig(), undefined, 4))
}

function preloader() {
    if(config == defaultConfig)
        config = {serverID: -1, preloader: {recommended: { gadget: true }}}
}

async function setConfig(newConfig, save = false) {
    const oldConfig = config
    config = newConfig

    const locationChanged = newConfig.cacheLocation !== oldConfig.cacheLocation
    if(save && locationChanged)
        try {
            await forceSave()
        } catch (error) {
            Logger.error(error)
        }

    if (config.cacheLocation == undefined || config.cacheLocation == "default")
        cacheLocation = join(userdata, "cache")
    else
        cacheLocation = config.cacheLocation

    if(locationChanged)
        loadCached()

    if(save)
        saveConfig()
}

function getConfig() {
    return config
}

function getCacheLocation() {
    if (cacheLocation == undefined || cacheLocation == "default")
        return "./cache/"

    return cacheLocation
}
