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

function sendRecent() {
    if(global.mainWindow)
        global.mainWindow.webContents.send("recent", recent)
}

function registerElectron(ipcMain) {
    const { join } = require("path")

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

module.exports = { log, error, registerElectron, send, sendRecent }
