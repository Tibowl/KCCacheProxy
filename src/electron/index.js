const { app, BrowserWindow, Tray, Menu, shell, Notification, ipcMain, ipcRenderer } = require("electron")
const path = require("path")


const AutoLaunch = require("auto-launch")

const al = new AutoLaunch({
    name: "KCCacheProxy",
    path: app.getPath("exe"),
})

const logSource = "kccp-main"

const ipc = require("../proxy/ipc")
ipc.registerElectron(ipcMain, app, al)
const config = require("../proxy/config")
config.loadConfig(app)

const { Proxy } = require("../proxy/proxy")
const { updateMod } = require("../proxy/mod/gitModHandler")
const { reloadModCache } = require("../proxy/mod/patcher")

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
    const autoStartup = async () => {
        if (process.platform !== "win32") {
            return false
        }

        switch (process.argv[1]) {
            case "--squirrel-install":
                // undefined should be handled as true
                if (config.getConfig().autoStartup === false)
                    await al.disable()
                else
                    await al.enable()
                app.quit()
                return
            case "--squirrel-uninstall":
                await al.disable()
                app.quit()
                return
        }
        app.quit()
    }

    return autoStartup()
}

// Prevent multiple instances
if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
}

async function checkVersion() {
    if (!config.getConfig().checkForUpdates) return
    ipc.log(logSource, "Version check: Automatically checking for new versions...")

    const result = await ipc.checkVersion(false)
    if (result.error)
        return ipc.error(logSource, `Version check: Failed to automatically check for updates ${result.error}`)

    const v = app.getVersion(), nv = result.release.tag_name
    if (`v${v}` == nv) {
        ipc.log(logSource, "Version check: Up to date!")
        return
    }
    ipc.log(logSource, `Version check: New version found! v${v} -> ${nv}`)

    if (global.mainWindow)
        global.mainWindow.webContents.send("version", result)

    if (config.getConfig().lastVersionCheck == nv && config.getConfig().lastVersionCheckTime > new Date().getTime() - 24 * 60 * 60 * 1000)
        return

    const notification = new Notification({
        title: "KCCacheProxy: New version",
        body: `A new version has been released! You are currently on v${v} while ${nv} is out. Click to open releases page`,
        timeoutType: "never",
        silent: false,
        icon: path.join(__dirname, process.platform === "win32" ? "icon.ico" : "icon.png")
    })
    notification.on("click", () => shell.openExternal("https://github.com/Tibowl/KCCacheProxy/releases"))
    notification.show()

    config.getConfig().lastVersionCheck = nv
    config.getConfig().lastVersionCheckTime = new Date().getTime()
    config.saveConfig()
}

async function checkGitModUpdates() {
    const conf = config.getConfig()
    if (!conf.autoUpdateGitMods) return

    for (const mod of conf.mods) {
        if (mod.git) {
            try {
                const updated = await updateMod(mod.path, mod.git)
                const englishPatchInstalled = mod.git == "https://github.com/Oradimi/KanColle-English-Patch-KCCP.git"
                global.mainWindow.webContents.send("englishPatchInstalled", englishPatchInstalled)
                if (updated && global.mainWindow) {
                    global.mainWindow.webContents.send("gitModUpdated", true)
                    reloadModCache()
                }

            } catch (error) {
                ipc.error(logSource, `Failed to update Git mod ${mod.git}:`, error)
            }
        }
    }
}

function registerMainWindow(window) {
    global.mainWindow = window
    ipc.setMainWindow(window)
}


async function createWindow() {
    const icon = path.join(__dirname, process.platform === "win32" ? "icon.ico" : "icon.png")

    // Create the browser window.
    const mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            nativeWindowOpen: true,
            devTools: true,
            enableRemoteModule: true
        },
        show: !config.getConfig().startHidden
    })

    registerMainWindow(mainWindow)

    // and load the index.html of the app.
    mainWindow.loadFile(path.join(__dirname, "index.html"))

    // Open the DevTools.
    // mainWindow.webContents.openDevTools()

    mainWindow.setMenu(null)

    mainWindow.setIcon(icon)

    const tray = new Tray(icon)
    tray.setToolTip("KCCacheProxy")
    tray.setContextMenu(Menu.buildFromTemplate([
        {
            label: "Show",
            click: () => {
                mainWindow.show()
                if (process.platform === "darwin")
                    app.dock.show()
            }
        }, {
            label: "Restart",
            click: async () => {
                await ipc.saveStats()
                app.isQuitting = true
                app.relaunch()
                app.quit()
            }
        }, {
            label: "Quit",
            click: async () => {
                await ipc.saveStats()
                app.isQuitting = true
                app.quit()
            }
        }
    ]))
    tray.on("double-click", () => mainWindow.show())

    mainWindow.on("minimize", (e) => {
        e.preventDefault()
        mainWindow.hide()
    })

    mainWindow.on("closed", () => registerMainWindow(null))
    mainWindow.on("close", (event) => {
        if (!app.isQuitting) {
            event.preventDefault()
            tray.displayBalloon({
                noSound: true,
                title: "KCCacheProxy is now hidden",
                content: "Double click tray icon to show"
            })
            mainWindow.hide()
            if (process.platform === "darwin")
                app.dock.hide()
        }

        return false
    })
    mainWindow.on("show", ipc.sendRecent)

    if (config.getConfig().startHidden)
        mainWindow.hide()

    var proxy = new Proxy()
    proxy.init()
    proxy.start()

    config.getConfig().autoStartup = await al.isEnabled()

    setTimeout(checkVersion, 3 * 1000)
    setInterval(checkVersion, 6 * 60 * 60 * 1000)
    setTimeout(checkGitModUpdates, 5 * 1000)
    setInterval(checkGitModUpdates, 6 * 60 * 60 * 1000)
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow)

// Quit when all windows are closed.
app.on("window-all-closed", () => {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== "darwin") {
        app.quit()
    }
})

app.on("activate", () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

app.on("second-instance", () => {
    // Someone tried to run a second instance, we should focus our window.
    /** @type {BrowserWindow} */
    const mainWindow = global.mainWindow

    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
    }
})
