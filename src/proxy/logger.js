/* eslint-disable no-console */
const consoleLog = console.log
const consoleError = console.error

console.log = log
console.error = error
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

    if(global.mainWindow)
        global.mainWindow.webContents.send(type, toSend)

    while (recent.length >= 50) recent.pop()
    recent.unshift(toSend)
}

function registerElectron(ipcMain) {
    ipcMain.on("getRecent", () => global.mainWindow.webContents.send("recent", recent))
}

module.exports = { log, error, registerElectron }
