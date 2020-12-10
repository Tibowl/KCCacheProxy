const { existsSync, readFileSync, exists, writeFile, ensureDir, unlink, move } = require("fs-extra")
const { join, dirname } = require("path")
const fetch = require("node-fetch")

module.exports = { log, error, registerElectron, send, sendRecent, checkVersion, addStatAndSend, saveStats, getStatsPath: () => statsPath, setStatsPath: (path) => statsPath = path }

/* eslint-disable no-console */
const consoleLog = console.log
const consoleError = console.error

console.log = log
console.error = error
console.trace = error
/* eslint-enable no-console */

const recent = []

/**
 * Log a message/object/etc to normal log
 * @param  {...any} input Stuff to log to normal log
 */
function log(...input) {
    consoleLog(...input)
    send("log", ...input)
}

/**
 * Log an error/message/object/etc to error
 * @param  {...any} input Stuff to log to error log
 */
function error(...input) {
    consoleError(...input)
    send("error", ...input)
}

let sendHelp = false

/** @typedef {"stats" | "log" | "error" | "help"} UpdateTypes */
/**
 * Send an update to render process
 * @param {UpdateTypes} type Type of message
 * @param  {...any} toSend Message to send
 */
function send(type, ...toSend) {
    if (type == "help" && !sendHelp) return
    toSend.unshift(type)
    toSend.unshift(new Date())

    if (global.mainWindow && (global.mainWindow.isVisible() || type == "stats"))
        global.mainWindow.webContents.send("update", toSend)

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
            send("stats", stats)
        }, 100)

    if (!saveStatsTimer)
        saveStatsTimer = setTimeout(saveStats, 5 * 60 * 1000)
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

    await writeFile(statsPath, JSON.stringify(stats))
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
            error("Failed to read ", e)
        }
    }

    if (existsSync(statsPath + ".old")) {
        try {
            stats = JSON.parse(readFileSync(statsPath + ".old").toString())
            log("Recovered stats from old file")
            return
        } catch (e) {
            error("Failed to read old file ", e)
        }
    }

    stats = {
        "startDate": new Date().getTime()
    }
}
/**
 * Send most recent messages
 */
function sendRecent() {
    if (global.mainWindow)
        global.mainWindow.webContents.send("recent", recent)
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
    loadStats()
    send("stats", stats)

    const config = require("./config")
    const { verifyCache, mergeCache, createDiff, clearMain } = require("./cacheHandler")
    const { extractSplit, importExternalMod, outlines } = require("./mod/modderUtils")
    const { reloadModCache, prepatch } = require("./mod/patcher")

    ipcMain.on("getRecent", () => sendRecent())
    ipcMain.on("getConfig", () => global.mainWindow.webContents.send("config", config.getConfig()))
    ipcMain.on("setConfig", (e, message) => config.setConfig(message, true, al))
    ipcMain.on("saveConfig", () => config.saveConfig())
    ipcMain.on("verifyCache", (e, poof) => verifyCache(poof))
    ipcMain.on("checkVersion", async () => global.mainWindow.webContents.send("version", await checkVersion(true)))
    ipcMain.on("reloadCache", () => require("./cacher").loadCached())
    ipcMain.on("preload", (e, rare) => require("./preload").run(rare))
    ipcMain.on("importCache", (e, path = join(__dirname, "../../minimum-cache.zip")) => mergeCache(path))
    ipcMain.on("createDiff", (e, source, target) => createDiff(source, target))
    ipcMain.on("extractSpritesheet", (e, source, target) => extractSplit(source, target))
    ipcMain.on("outlines", (e, source, target) => outlines(source, target))
    ipcMain.on("importExternalMod", (e, source, target) => importExternalMod(source, target))
    ipcMain.on("reloadModCache", () => reloadModCache())
    ipcMain.on("prepatch", () => prepatch())
    ipcMain.on("startHelp", () => {
        sendHelp = true
        clearMain()
    })
}
