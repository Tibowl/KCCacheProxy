const { existsSync, readFileSync, writeFileSync, ensureDirSync } = require("fs-extra")
const { join, dirname } = require("path")

module.exports = { getConfig, getCacheLocation, loadConfig, saveConfig, setConfig, preloader }

const Logger = require("./ipc")
const { forceSave, loadCached } = require("./cacher")

const logSource = "kccp-config"

const configFile = "config.json"
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
    "serverIP": "w15p.kancolle-server.com",
    "bypassGadgetUpdateCheck": false,
    "gameVersionOverwrite": "false",
    "preloadOnStart": false,
    "showExtraButtons": false,
    "enableModder": false,
    "autoUpdateGitMods": true,
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

let app = undefined,
    userdata = process.env.DATA_DIR || "."

/** @typedef {defaultConfig} config */
/** @type {config} */
let config = defaultConfig
if (process.env.DATA_DIR) {
    const configPath = join(process.env.DATA_DIR, configFile)
    if (existsSync(configPath)) {
        config = {
            ...defaultConfig,
            ...JSON.parse(readFileSync(configPath, "utf8"))
        }
    } else if (process.env.CONFIG_DEFAULT_FILE) {
        config = {
            ...defaultConfig,
            ...JSON.parse(readFileSync(process.env.CONFIG_DEFAULT_FILE, "utf8"))
        }
        saveConfig()
    }
} else if (existsSync(configFile)) {
    config = {
        ...defaultConfig,
        ...JSON.parse(readFileSync(configFile, "utf8"))
    }
}

let cacheLocation = config.cacheLocation

/**
 * Load config from electron folder
 * @param {import("electron").app} electronApp Electron app
 */
function loadConfig(electronApp) {
    app = electronApp // Prevent compiling electron stuff in small versions

    userdata = join(app.getPath("userData"), "ProxyData")
    const configLocation = join(userdata, configFile)

    Logger.log(logSource, `Loading config from: ${configLocation}`)

    if (existsSync(configLocation)) {
        const loadedConfig = JSON.parse(readFileSync(configLocation))
        config = Object.assign({}, defaultConfig, loadedConfig)

        if (JSON.stringify(config) !== JSON.stringify(loadedConfig)) // Save new defaults
            saveConfig()
    } else
        config = defaultConfig

    let shouldSave = false
    if (config.configVersion <= 2) {
        Logger.log(logSource, "Updating config version 2 -> 3, hopefully nothing breaks")

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
    const configLocation = join(userdata, configFile)
    Logger.log(logSource, `Saving config to ${configLocation}`)

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
            Logger.error(logSource, error)
        }

    if (al !== undefined) {
        const enabled = await al.isEnabled()

        if (enabled && !newConfig.autoStartup) {
            await al.disable()
            Logger.log(logSource, "Disabled startup")
        } else if (!enabled && newConfig.autoStartup) {
            await al.enable()
            Logger.log(logSource, "Enabled startup")
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
