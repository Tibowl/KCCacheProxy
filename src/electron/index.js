const { app, BrowserWindow, Tray, Menu, ipcMain } = require("electron")
const path = require("path")

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
    const autoStartup = async () => {
        if (process.platform !== "win32") {
            return false
        }

        const AutoLaunch = require("auto-launch")

        const al = new AutoLaunch({
            name: "KCCacheProxy",
            path: app.getPath("exe"),
        })

        switch (process.argv[1]) {
            case "--squirrel-install":
            case "--squirrel-updated":
                await al.enable()
                app.quit()
                return
            case "--squirrel-uninstall":
                await al.disable()
                app.quit()
                return
            case "--squirrel-obsolete":
                app.quit()
                return
        }
        app.quit()
    }

    return autoStartup()
}

const createWindow = () => {
    // Create the browser window.
    const mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true
        },
        show: !config.getConfig().startHidden
    })

    // and load the index.html of the app.
    mainWindow.loadFile(path.join(__dirname, "index.html"))

    // Open the DevTools.
    // mainWindow.webContents.openDevTools()
    mainWindow.setMenu(null)

    const icon = path.join(__dirname, "icon.ico")
    mainWindow.setIcon(icon)

    const tray = new Tray(icon)
    tray.setToolTip("KCCacheProxy")
    tray.setContextMenu(Menu.buildFromTemplate([
        {
            label: "Show",
            click: () => mainWindow.show()
        }, {
            label: "Restart",
            click: () => {
                app.isQuiting = true
                app.relaunch()
                app.quit()
            }
        }, {
            label: "Quit",
            click: () => {
                app.isQuiting = true
                app.quit()
            }
        }
    ]))
    tray.on("double-click", () => mainWindow.show())

    mainWindow.on("minimize", (e) => {
        e.preventDefault()
        mainWindow.hide()
    })

    mainWindow.on("closed", () => global.mainWindow = null)
    mainWindow.on("close", (event) => {
        if(!app.isQuiting){
            event.preventDefault()
            tray.displayBalloon({
                "noSound": true,
                "title": "KCCacheProxy is now hidden",
                "content": "Double click tray icon to show"
            })
            mainWindow.hide()
        }

        return false
    })
    mainWindow.on("show", ipc.sendRecent)

    if (config.getConfig().startHidden)
        mainWindow.hide()

    global.mainWindow = mainWindow
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

const ipc = require("../proxy/ipc")
ipc.registerElectron(ipcMain, app)
const config = require("../proxy/config")
config.loadConfig(app)

require("../proxy/proxy")
