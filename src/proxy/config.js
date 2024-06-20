const { existsSync, readFileSync, writeFileSync, ensureDirSync } = require("fs-extra")
const { join, dirname } = require("path")

module.exports = { getConfig, getCacheLocation, loadConfig, saveConfig, setConfig, preloader }

const Logger = require("./ipc")
const { forceSave, loadCached } = require("./cacher")

const defaultConfig = {
    "port": 8081,
    "socks5Port": 1080,
    "socks5Enabled": false,
    "socks5Users": [
        { "user": "MyKccpUser", "password": "ChangeMe" }
    ],
    "hostname": "127.0.0.1",
    "cacheLocation": "default",
    "checkForUpdates": true,
    "startHidden": false,
    "disableBrowserCache": false,
    "verifyCache": false,
    "serverIP": "203.104.209.23",
    "bypassGadgetUpdateCheck": false,
    "gameVersionOverwrite": "false",
    "preloadOnStart": false,
    "showExtraButtons": false,
    "enableModder": false,
    "mods": [],
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
    "configVersion": 3
}

/** @typedef {defaultConfig} config */
/** @type {config} */
let config = existsSync("./config.json") ? Object.assign({}, defaultConfig, JSON.parse(readFileSync("./config.json"))) : defaultConfig
let cacheLocation = config.cacheLocation

let app = undefined, userdata = "."
/**
 * Load config from electron folder
 * @param {import("electron").app} electronApp Electron app
 */
function loadConfig(electronApp) {
    app = electronApp // Prevent compiling electron stuff in small versions

    userdata = join(app.getPath("userData"), "ProxyData")
    const configLocation = join(userdata, "config.json")

    Logger.log(`Loading config from: ${configLocation}`)

    if (existsSync(configLocation)) {
        const loadedConfig = JSON.parse(readFileSync(configLocation))
        config = Object.assign({}, defaultConfig, loadedConfig)

        if (JSON.stringify(config) !== JSON.stringify(loadedConfig)) // Save new defaults
            saveConfig()
    } else
        config = defaultConfig

    let shouldSave = false
    if (config.configVersion <= 2) {
        Logger.log("Updating config version 2 -> 3, hopefully nothing breaks")

        config.mods = config.mods.map((path) => {
            return {
                path
            }
        })
        config.configVersion = 3
        shouldSave = true
    }

    setConfig(config, shouldSave)
}

/**
 * Save config to disk
 */
function saveConfig() {
    const configLocation = join(userdata, "config.json")
    Logger.log(`Saving config to ${configLocation}`)

    ensureDirSync(dirname(configLocation))
    writeFileSync(configLocation, JSON.stringify(getConfig(), undefined, 2))
}

/**
 * Load preloader config
 */
function preloader() {
    if (config == defaultConfig)
        config = {
            serverIP: false,
            preloader: {
                maxSimulPreload: 16,
                recommended: { gadget: true }
            }
        }
}

/**
 * Update config, will reload cache if changed
 * @param {any} newConfig New config
 * @param {boolean} [save] Write to disk
 * @param {import("auto-launch")} [al] Autolauncher
 */
async function setConfig(newConfig, save = false, al = undefined) {
    const oldConfig = config
    config = newConfig

    const locationChanged = newConfig.cacheLocation !== oldConfig.cacheLocation
    if (save && locationChanged)
        try {
            await forceSave()
        } catch (error) {
            Logger.error(error)
        }

    if (al !== undefined) {
        const enabled = await al.isEnabled()

        if (enabled && !newConfig.autoStartup) {
            await al.disable()
            Logger.log("Disabled startup")
        } else if (!enabled && newConfig.autoStartup) {
            await al.enable()
            Logger.log("Enabled startup")
        }
    }

    if (config.cacheLocation == undefined || config.cacheLocation == "default")
        cacheLocation = join(userdata, "cache")
    else
        cacheLocation = config.cacheLocation

    if (locationChanged)
        loadCached()

    if (save)
        saveConfig()
}

/**
 * Get config
 */
function getConfig() {
    return config
}

/**
 * Get location of cache folder
 */
function getCacheLocation() {
    if (cacheLocation == undefined || cacheLocation == "default")
        return "./cache/"

    return cacheLocation
}
