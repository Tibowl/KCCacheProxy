const { existsSync, readFileSync, exists, writeFile, ensureDir, unlink, move } = require("fs-extra")
const { join, dirname } = require("path")
const fetch = require("node-fetch")

module.exports = { log, error, trace, registerElectron, send, sendRecent, setMainWindow, checkVersion, addStatAndSend, saveStats, getStatsPath: () => statsPath, setStatsPath: (path) => statsPath = path }

const elevate = require("windows-elevate")
const { execFile } = require("child_process")
const { mitmCaPath } = require("./proxy")

// Log source for internally-generated messages
const logSource = "kccp-logger"

/* eslint-disable no-console */
const consoleLog = console.log
const consoleError = console.error
const consoleTrace = console.trace

// TODO: this hijacks the console.log of anything that loads this as a module
// ...maybe don't do that
// console.log = (...input) => log("Unknown", ...input)
// console.error = (...input) => error("Unknown", ...input)
// console.trace = (...input) => trace("Unknown", ...input)
/* eslint-enable no-console */

const recent = []

let mainWindow = undefined

/**
 * Log a message/object/etc to normal log
 * @param  {...any} input Stuff to log to normal log
 */
function log(source, ...input) {
    consoleLog(...input)
    send(source, "log", ...input)
}

/**
 * Log an error/message/object/etc to error
 * @param  {...any} input Stuff to log to error log
 */
function error(source, ...input) {
    consoleError(...input)
    send(source, "error", ...input)
}

/**
 * Log a stack trace
 * @param  {...any} input Stuff to log to trace log
 */
function trace(source, ...input) {
    consoleTrace(...input)
    send(source, "trace", ...input)
}

let sendHelp = false

/** @typedef {"stats" | "log" | "error" | "trace" | "help"} UpdateTypes */
/**
 * Send an update to render process
 * @param {UpdateTypes} type Type of message
 * @param  {...any} toSend Message to send
 */
function send(source, type, ...toSend) {
    if (type == "help" && !sendHelp) return
    toSend.unshift(type)
    toSend.unshift(source)
    toSend.unshift(new Date())

    if (mainWindow && (mainWindow.isVisible() || type == "stats"))
        mainWindow.webContents.send("update", toSend)

    while (recent.length >= 150) recent.pop()
    if (type != "help") recent.unshift(toSend)
}

let sendStats = undefined, saveStatsTimer = undefined, statsPath = undefined
let stats = undefined
/**
 * Update a stat and queue sending
 * @param {string} statType Type of stat
 * @param {number} amount Amount to increase
 */
function addStatAndSend(statType, amount = 1) {
    if (statsPath == undefined) return
    if (stats == undefined) loadStats()

    stats[statType] = (stats[statType] || 0) + amount

    if (!sendStats)
        sendStats = setTimeout(() => {
            sendStats = undefined
            send(logSource, "stats", stats)
        }, 100)

    if (!saveStatsTimer)
        saveStatsTimer = setTimeout(saveStats, 60 * 1000)
}
/**
 * Save stats to disk
 */
async function saveStats() {
    if (statsPath == undefined) return
    if (saveStatsTimer) {
        clearTimeout(saveStatsTimer)
        saveStatsTimer = undefined
    }

    await ensureDir(dirname(statsPath))

    if (await exists(statsPath + ".old"))
        await unlink(statsPath + ".old")

    if (await exists(statsPath))
        await move(statsPath, statsPath + ".old")

    await writeFile(statsPath, JSON.stringify(stats, null, 2))
}
/**
 * Load stats from disk
 */
function loadStats() {
    if (statsPath == undefined) return
    if (existsSync(statsPath)) {
        try {
            stats = JSON.parse(readFileSync(statsPath).toString())
            return
        } catch (e) {
            error(logSource, "Failed to read ", e)
        }
    }

    if (existsSync(statsPath + ".old")) {
        try {
            stats = JSON.parse(readFileSync(statsPath + ".old").toString())
            log(logSource, "Recovered stats from old file")
            return
        } catch (e) {
            error(logSource, "Failed to read old file ", e)
        }
    }

    stats = {
        "startDate": new Date().getTime()
    }
}
/**
 * Check and install MITM certificate
 */
async function checkTrustMitmCert() {
    const issuer = 'NodeMITMProxyCA'

    execFile('certutil', ['-store', 'Root'], { shell: true }, async (err, stdout, stderr) => {
        if (err) {
            error(logSource, 'Error listing certs:', stderr);
            return;
        }

        // Example: check if your issuer CN appears
        if (stdout.includes(`CN=${issuer}`)) {
            log(logSource, `Issuer cert CN=${issuer} already installed`);
        } else {
            log(logSource, `Issuer cert CN=${issuer} not found`);

            elevate.exec("certutil", ["-addstore", "Root", `${mitmCaPath}`], (error, stdout, stderror) => {
                if (error) {
                    error(logSource, 'Failed to install cert.', error, stderror);
                } else {
                    log(logSource, 'Cert installed.', stdout);
                }
            })
        }
    });
}
/**
 * Send most recent messages
 */
function sendRecent() {
    if (mainWindow)
        mainWindow.webContents.send("recent", recent)
}
/**
 * Register main window for IPC communication
 */
function setMainWindow(window) {
    mainWindow = window
}
/**
 * Check latest version
 */
async function checkVersion(manual) {
    try {
        const releases = await (await fetch("https://api.github.com/repos/Tibowl/KCCacheProxy/releases")).json()
        return { manual, release: releases.find(r => !r.prerelease) }
    } catch (error) {
        return { manual, error: error.toString() }
    }
}
/**
 * Register electron listeners and load stats from disk
 * @param {import("electron").ipcMain} ipcMain Connection with render process
 * @param {import("electron").App} app Electron app
 * @param {import("auto-launch")} al Autolauncher
 */
function registerElectron(ipcMain, app, al) {
    statsPath = join(app.getPath("userData"), "ProxyData", "stats.json")
    const modsPath = join(app.getPath("userData"), "ProxyData", "mods")
    loadStats()
    send(logSource, "stats", stats)

    const config = require("./config")
    const { verifyCache, mergeCache, createDiff, clearMain } = require("./cacheHandler")
    const { extractSplit, importExternalMod, outlines } = require("./mod/modderUtils")
    const { reloadModCache, prepatch } = require("./mod/patcher")
    const { handleModInstallation, updateMod } = require("./mod/gitModHandler")

    ipcMain.on("getRecent", () => sendRecent())
    ipcMain.on("getConfig", () => mainWindow.webContents.send("config", config.getConfig()))
    ipcMain.on("setConfig", (e, message) => config.setConfig(message, true, al))
    ipcMain.on("saveConfig", () => config.saveConfig())
    ipcMain.on("verifyCache", (e, poof) => verifyCache(poof))
    ipcMain.on("checkVersion", async () => mainWindow.webContents.send("version", await checkVersion(true)))
    ipcMain.on("checkTrustMitmCert", () => checkTrustMitmCert())
    ipcMain.on("reloadCache", () => require("./cacher").loadCached())
    ipcMain.on("preload", (e, rare) => require("./preload").run(rare))
    ipcMain.on("importCache", (e, path = join(__dirname, "../../minimum-cache.zip")) => mergeCache(path))
    ipcMain.on("createDiff", (e, source, target) => createDiff(source, target))
    ipcMain.on("extractSpritesheet", (e, source, target) => extractSplit(source, target))
    ipcMain.on("outlines", (e, source, target) => outlines(source, target))
    ipcMain.on("importExternalMod", (e, source, target) => importExternalMod(source, target))
    ipcMain.on("reloadModCache", () => reloadModCache())
    ipcMain.on("prepatch", () => prepatch())
    ipcMain.on("installGitMod", async (e, url) => {
        const result = await handleModInstallation(modsPath, url, config.getConfig(), config)
        mainWindow.webContents.send("gitModUpdated", result)
    })
    ipcMain.on("updateGitMod", async (e, modPath, gitRemote) => {
        const result = await updateMod(modPath, gitRemote)
        mainWindow.webContents.send("gitModUpdated", result)
    })

    ipcMain.on("startHelp", () => {
        sendHelp = true
        clearMain()
    })
}
