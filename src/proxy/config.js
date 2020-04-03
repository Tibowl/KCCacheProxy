const { existsSync, readFileSync } = require("fs-extra")
const path = require("path")

const Logger = require("./logger")

const defaultConfig = {
    "port": 8081,
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

let config = existsSync("./config.json") ? JSON.parse(readFileSync("./config.json")) : defaultConfig

function loadConfig(app) {
    const userdata = app.getPath("userData")
    const configLocation = path.join(userdata, "config.json")

    Logger.log("Loading config from " + configLocation)

    if (existsSync(configLocation))
        config = JSON.parse(readFileSync(configLocation))
    else
        config = defaultConfig
}

function preloader() {
    if(config == defaultConfig)
        config = {serverID: -1, preloader: {recommended: { gadget: true }}}
}

function getConfig() {
    return config
}

module.exports = { getConfig, loadConfig, preloader }
