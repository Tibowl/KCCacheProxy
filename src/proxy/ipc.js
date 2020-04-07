const { existsSync, readFileSync, exists, writeFile, ensureDir, unlink, move } = require("fs-extra")
const { join, dirname } = require("path")

module.exports = { log, error, registerElectron, send, sendRecent, addStatAndSend, saveStats, getStatsPath: () => statsPath, setStatsPath: (path) => statsPath = path }

/* eslint-disable no-console */
const consoleLog = console.log
const consoleError = console.error

console.log = log
console.error = error
console.trace = error
/* eslint-enable no-console */

const recent = []

function log(...input) {
    consoleLog(...input)
    send("log", ...input)
}

function error(...input) {
    consoleError(...input)
    send("error", ...input)
}

function send(type, ...toSend) {
    toSend.unshift(type)
    toSend.unshift(new Date())

    if(global.mainWindow && (global.mainWindow.isVisible() || type == "stats"))
        global.mainWindow.webContents.send("update", toSend)

    while (recent.length >= 150) recent.pop()
    recent.unshift(toSend)
}

let sendStats = undefined, saveStatsTimer = undefined, statsPath = undefined
let stats = undefined
function addStatAndSend(statType, amount = 1) {
    if(statsPath == undefined) return
    if(stats == undefined) loadStats()

    stats[statType] = (stats[statType] || 0) + amount

    if (!sendStats)
        sendStats = setTimeout(() => {
            sendStats = undefined
            send("stats", stats)
        }, 100)

    if (!saveStatsTimer)
        saveStatsTimer = setTimeout(saveStats, 5*60*1000)
}
async function saveStats() {
    if(statsPath == undefined) return
    if(saveStatsTimer) {
        clearTimeout(saveStatsTimer)
        saveStatsTimer = undefined
    }

    await ensureDir(dirname(statsPath))

    if(await exists(statsPath + ".old"))
        await unlink(statsPath + ".old")

    if(await exists(statsPath))
        await move(statsPath, statsPath + ".old")

    await writeFile(statsPath, JSON.stringify(stats))
}
function loadStats() {
    if(statsPath == undefined) return
    if(existsSync(statsPath)) {
        try {
            stats = JSON.parse(readFileSync(statsPath).toString())
            return
        } catch (e) {
            error("Failed to read ", e)
        }
    }

    if(existsSync(statsPath + ".old")) {
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

function sendRecent() {
    if(global.mainWindow)
        global.mainWindow.webContents.send("recent", recent)
}

function registerElectron(ipcMain, app) {
    statsPath = join(app.getPath("userData"), "ProxyData", "stats.json")
    loadStats()
    send("stats", stats)

    const config = require("./config")
    const { verifyCache, mergeCache } = require("./cacheHandler")

    ipcMain.on("getRecent", () => sendRecent())
    ipcMain.on("getConfig", () => global.mainWindow.webContents.send("config", config.getConfig()))
    ipcMain.on("setConfig", (e, message) => config.setConfig(message, true))
    ipcMain.on("saveConfig", () => config.saveConfig())
    ipcMain.on("verifyCache", () => verifyCache())
    ipcMain.on("reloadCache", () => require("./cacher").loadCached())
    ipcMain.on("importCache", () => {
        const path = join(__dirname, "../../cache_template/cache/")
        mergeCache(path)
    })
}
