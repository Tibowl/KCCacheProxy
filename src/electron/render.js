/* eslint-disable no-undef */
const { remote, ipcRenderer, shell } = require("electron")
const { join } = require("path")
const { readFileSync, existsSync } = require("fs-extra")
const fetch = require("node-fetch")

const BASEURL = "https://github.com/Tibowl/KCCacheProxy"
let englishPatchInstalled = false;

ipcRenderer.on("englishPatchInstalled", (e, message) => {
    englishPatchInstalled = message;
});

ipcRenderer.on("update", (e, message) => update(message))
ipcRenderer.on("recent", (e, message) => {
    recent = []
    log.innerHTML = ""
    message.reverse().forEach(m => update(m))
})
ipcRenderer.on("config", (e, message) => updateConfig(message))
ipcRenderer.on("version", (e, { manual, error, release }) => {
    if (error) {
        addLog("error", new Date(), error)
        if (manual)
            alert(`Failed to check for updates: ${error}`)
        return
    }

    const v = remote.app.getVersion()
    if (`v${v}` == release.tag_name) {
        if (manual)
            addLog("log", new Date(), "Version check: Up to date!")
        return
    }

    if (manual) {
        addLog("log", new Date(), `Version check: New version found! v${v} -> ${release.tag_name}`)

        // Show prompt after page is redrawn
        requestAnimationFrame(() =>
            setImmediate(() => {
                if (confirm(`A new version has been found! v${v} -> ${release.tag_name}\n\nDo you want to open the release page in browser?`))
                    shell.openExternal(`${BASEURL}/releases/`)
            }))
    }

    document.getElementById("update").style = ""
    document.getElementById("newVersion").innerText = release.tag_name
    document.getElementById("openReleases").onclick = () => shell.openExternal(`${BASEURL}/releases/`)
})

/**
 * Handle a message
 * @param {[Date, import("../proxy/ipc").UpdateTypes, ...]} message Update message
 */
function update(message) {
    const messageDate = message.shift()
    message.shift() // source
    const messageType = message.shift()

    switch (messageType) {
        case "error":
        case "log":
            addLog(messageType, messageDate, ...message)
            break
        case "stats":
            updateStats(message.shift())
            break
        case "help":
            updateHelp(message.shift())
            break
    }
}

function disableLogClicks() {
    document.querySelectorAll("#log .loggable").forEach(log => {
        
    });
}

let recent = []
const log = document.getElementById("log")
const navLog = document.getElementById("nav-logs")
const logFooter = document.getElementById("log-footer");
/**
 * Add a log element to log
 * @param {"error"|"log"} messageType Type of message, affects color
 * @param {Date} messageDate Date of message
 * @param {any[]} message Rest of message, array gets mapped and joined together
 */
function addLog(messageType, messageDate, ...message) {
    recent.unshift(message)
    while (recent.length >= 100) {
        log.removeChild(log.children[log.children.length - 1])
        recent.pop()
    }

    const elem = document.createElement("div")
    elem.className = `loggable ${messageType}`

    const f = (t, l = 2) => t.toString().padStart(l, "0")
    const date = document.createElement("span")
    date.className = "date"
    date.innerText = `${f(messageDate.getHours())}:${f(messageDate.getMinutes())}:${f(messageDate.getSeconds())}.${f(messageDate.getMilliseconds(), 3)}`
    elem.appendChild(date)

    const separator = document.createElement("span")
    separator.className = "separator"
    separator.innerText = ": "
    elem.appendChild(separator)

    const msg = document.createElement("span")
    msg.className = "msg"
    msg.innerText = message.map(k => {
        switch (typeof k) {
            case "string":
            case "undefined":
                return k

            default:
                return k.toString == Object.prototype.toString ? JSON.stringify(k) : k.toString()
        }
    }).join(" ")
    elem.appendChild(msg)

    elem.addEventListener("mouseover", () => {
        elem.style.overflowX = "auto"
    })

    elem.addEventListener("mouseout", () => {
        elem.style.overflowX = "hidden"
    })

    log.appendChild(elem, log.firstChild)
    logFooter.textContent = `${date.innerText}: ${msg.innerText}`

    navLog.scrollTop = navLog.scrollHeight
    navLog.scrollLeft = navLog.scrollWidth
}

/** @typedef {"date"|"number"|"numberH"|"bytes"|"show"} Render */
/** @type {Object.<string, Render>} */
const stats = {
    "startDate"         : "date",

    // Cache stats
    "cachedFiles"       : "number",
    "cachedSize"        : "bytes",
    "oldCache"          : "show",

    // Ignored
    "passthrough"       : "show",
    "passthroughHTTP"   : "number",
    "passthroughHTTPS"  : "number",

    // Cacher stats
    "totalHandled"      : "number",
    "inCache"           : "numberH",
    "blocked"           : "numberH",
    "failed"            : "numberH",
    "notModified"       : "numberH",
    "fetched"           : "numberH",
    "bandwidthSaved"    : "bytes",
}
/**
 * Update the value of a stat or multiple stats in UI
 * @param newStats Updated stats, <key, value> with key in stats
 */
function updateStats(newStats) {
    for (const [key, type] of Object.entries(stats)) {
        const value = newStats[key]
        if (value == undefined) continue

        switch (type) {
            case "numberH":
                document.getElementById(`${key}H`).style = value > 0 ? "" : "display:none;"
            // eslint-disable-next-line no-fallthrough
            case "number":
                document.getElementById(key).innerText = value.toLocaleString()
                break
            case "show":
                document.getElementById(key).style = value ? "" : "display:none;"
                break
            case "bytes":
                document.getElementById(key).innerText = formatBytes(value)
                break
            case "date": {
                const date = new Date(value)
                const f = (v) => v.toString().padStart(2, 0)
                document.getElementById(key).innerText = `${date.getFullYear()}-${f(date.getMonth() + 1)}-${f(date.getDate())}`
                break
            }
            default:
                document.getElementById(key).innerText = value
                break
        }
    }
}

const sizes = ["B", "KB", "MB", "GB", "TB"]
/**
 * Formats bytes to 3 digits + B/KB/MB/GB/TB
 * @param {number} size Size in bytes
 */
function formatBytes(size = 0) {
    let ind = 0
    while (size >= 1000 && ind < sizes.length - 1) {
        size /= 1024
        ind++
    }
    return `${size.toPrecision(3)} ${sizes[ind]}`
}

const settings = document.getElementById("settings")
/** @type {undefined | import("./../proxy/config").config} */
let config = undefined

/**
 * @typedef {Object} SettableInput
 * @property {"number" | "text" | "checkbox"} type
 * @property {number} [min]
 * @property {number} [max]
 * */
/**
 * @typedef {Object} Settable
 * @property {string} label
 * @property {string} title
 * @property {string} [ifEmpty]
 * @property {(value) => boolean} [verify]
 * @property {SettableInput} input
 * @property {Electron.OpenDialogOptions} [dialog]
 * */
/** @type {Object.<string, Settable>} */
const settable = {
    "hostname": {
        "label": "Hostname",
        "ifEmpty": "127.0.0.1",
        "title": "Hostname used by proxy. You'll need to restart to apply changes.",
        "input": {
            "type": "text"
        }
    },
    "port": {
        "label": "Port",
        "ifEmpty": "8081",
        "title": "Port used by proxy. You'll need to restart to apply changes.",
        "input": {
            "type": "number",
            "min": 1,
            "max": 65536,
        },
        "verify": (v) => v < 65537 && v > 0,
        "verifyError": "Invalid port, needs to be between 1 and 65536"
    },
    "cacheLocation": {
        "label": "Cache location",
        "ifEmpty": "default",
        "title": "Cache location used by proxy.",
        "input": {
            "type": "text"
        },
        "dialog": {
            "title": "Select Cache folder",
            "properties": ["openDirectory"]
        }
    },
    "gameVersionOverwrite": {
        "label": "Overwrite game version",
        "ifEmpty": "false",
        "title": "Overwrite game version. Entering 'false' will use cached game version. 'kca' will use KC android version tag.",
        "input": {
            "type": "text"
        },
        "verify": (v) => v == "false" || v == "kca" || v.match(/^\d\.\d\.\d\.\d$/),
        "verifyError": "Invalid version, needs to be 'false' or X.Y.Z.A with letter being a digit"
    },
    "startHidden": {
        "label": "Start in system tray",
        "title": "Whenever or not window should start in system tray.",
        "input": {
            "type": "checkbox"
        }
    },
    "autoStartup": {
        "label": "Start up with system",
        "title": "Whenever or not to start up with system.",
        "input": {
            "type": "checkbox"
        }
    },
    "enableModder": {
        "label": "Enable mods",
        "title": "Whenever or not the proxy should process mods.",
        "input": {
            "type": "checkbox"
        }
    },
    "autoUpdateGitMods": {
        "label": "Auto-update Git mods",
        "title": "Whether to automatically check for and update installed Git mods.",
        "input": {
            "type": "checkbox"
        }
    },
    "disableBrowserCache": {
        "label": "Disable browser caching",
        "title": "Whenever or not the proxy should tell the browser to cache the files or not.",
        "input": {
            "type": "checkbox"
        }
    },
    "verifyCache": {
        "label": "Automatically verify cache integrity",
        "title": "Whenever or not the proxy should automatically save cache.",
        "input": {
            "type": "checkbox"
        }
    },
    "bypassGadgetUpdateCheck": {
        "label": "Bypass gadget server",
        "title": "Whenever or not the proxy should check for updates of files on gadget server.",
        "input": {
            "type": "checkbox"
        }
    },
}
/**
 * Update config
 * @param {import("./../proxy/config").config} c Config file
 */
function updateConfig(c) {
    settings.innerHTML = ""
    config = c

    const enableModder = document.getElementById("enableModder")
    enableModder.checked = config["enableModder"]
    enableModder.onchange = checkSaveable

    const autoUpdateGitMods = document.getElementById("autoUpdateGitMods")
    autoUpdateGitMods.checked = config["autoUpdateGitMods"]
    autoUpdateGitMods.onchange = checkSaveable

    // Add settings UI
    for (const [key, value] of Object.entries(settable)) {
        if (key == "enableModder" || key == "autoUpdateGitMods") {
            // These keys are in the Assets modifier tab and hardcoded directly in index.html
            continue
        }

        const label = document.createElement("label")
        if (value.title)
            label.title = value.title
        const text = document.createElement("p")
        text.innerText = `${value.label}`
        text.className = "setting-key"

        const input = document.createElement("input")
        for (const [K, V] of Object.entries(value.input))
            input[K] = V

        input.id = key
        input.className = "setting-value"
        switch (value.input.type) {
            case "checkbox":
                input.checked = config[key]
                break
            default:
                input.value = config[key]
                break
        }
        input.onchange = checkSaveable
        
        if (value.dialog) {
            value.dialog.defaultPath = config[key]
            if (key == "cacheLocation" && (config[key] == undefined || config[key] == "default"))
                value.dialog.defaultPath = join(remote.app.getPath("userData"), "ProxyData", "cache")
            
            const container = document.createElement("div")
            container.className = "cache-location"

            const dialogButton = document.createElement("button")
            dialogButton.className = "setting-value"
            dialogButton.innerText = "..."
            dialogButton.onclick = () => remote.dialog.showOpenDialog(value.dialog).then((v) => {
                if (v.canceled) return
                input.value = v.filePaths[0]
                checkSaveable()
            })
            container.appendChild(input)
            container.appendChild(dialogButton)
            label.appendChild(text)
            label.appendChild(container)
        }
        else {
            switch (value.input.type) {
                case "checkbox":
                    const container = document.createElement("div")
                    container.style.display = "inline-flex"
                    container.style.alignItems = "center"
                    input.style.marginRight = "8px"
                    container.appendChild(input)
                    container.appendChild(text)
                    label.appendChild(container)
                    break
                default:
                    label.appendChild(text)
                    label.appendChild(input)
                    break
            }
        }

        settings.appendChild(label)
    }

    updateHidden()
}

const saveButton = document.getElementById("save")
let newConfig = config
/**
 * Check if anything needs to be saved in new config
 */
function checkSaveable() {
    newConfig = JSON.parse(JSON.stringify(config))

    let foundDifferent = false
    let changedParameter = ""
    for (const [key, settings] of Object.entries(settable)) {
        const input = document.getElementById(key)
        let value = getValue(key, input)

        if (settings.ifEmpty !== undefined && input.value == "")
            value = input.value = newConfig[key] = settings.ifEmpty

        if (settings.verify !== undefined && !settings.verify(value)) {
            addLog("error", new Date(), settings.verifyError)
            value = input.value = newConfig[key] = config[key]
        }

        if (value != config[key]) {
            changedParameter = key
            foundDifferent = true
        }  

        newConfig[key] = value
    }
    if (foundDifferent)
        saveConfig()

    function getValue(key, input) {
        switch (settable[key].input.type) {
            case "number":
                return +input.value
            case "checkbox":
                return input.checked
            default:
                return input.value
        }
    }
}

/**
 * Save config
 */
function saveConfig() {
    ipcRenderer.send("setConfig", newConfig)
    config = newConfig
    saveButton.disabled = true

    updateHidden()
}

let cacheReload
function reload() {
    if (cacheReload) clearTimeout(cacheReload)
    cacheReload = setTimeout(() => {
        ipcRenderer.send("setConfig", config)
        ipcRenderer.send("reloadModCache")
        cacheReload = undefined
    }, 2000)
}
function updateHidden() {
    // Add hidden areas
    document.getElementById("extraButtons").style = config.showExtraButtons ? "" : "display:none"
    document.getElementById("modder").style = config.enableModder ? "display:none" : ""

    // Modder
    const list = document.getElementById("mods")
    list.innerHTML = ""

    for (const mod of config.mods) {
        const elem = document.createElement("li")
        elem.style.display = "grid"
        elem.style.alignItems = "center"
        elem.style.gridTemplateColumns = "auto auto 1fr 0fr";
        elem.style.gap = "4px";
        list.appendChild(elem)

        const add = function (tag, text, gridRow, gridColumn) {
            const child = document.createElement(tag)
            child.innerText = text
            child.style.gridRow = gridRow
            child.style.gridColumn = gridColumn
            elem.appendChild(child)
        }
        const addButton = function (text, callback, disabled = false, className = "", gridRow, gridColumn) {
            const button = document.createElement("button")
            button.innerText = text
            button.disabled = disabled
            button.className = className
            button.style.gridRow = gridRow
            button.style.gridColumn = gridColumn
            button.onclick = callback
            elem.appendChild(button)
        }
        const addIconButton = function (element, callback, disabled = false, className = "", gridRow, gridColumn) {
            const button = document.createElement("button")
            button.disabled = disabled
            button.className = className
            button.style.gridRow = gridRow
            button.style.gridColumn = gridColumn
            button.onclick = callback
            button.appendChild(element)
            elem.appendChild(button)
        }
        const move = function (direction) {
            const ind = config.mods.indexOf(mod)
            config.mods.splice(ind, 1)
            config.mods.splice(ind + direction, 0, mod)

            reload()
            updateHidden()
        }
        // Icons
        const desktopIcon = document.createElement("img")
        desktopIcon.className = "flat-icon"
        desktopIcon.src = "resources/folder-open.svg"
        desktopIcon.height = 16
        desktopIcon.width = 16
        const webIcon = document.createElement("img")
        webIcon.className = "flat-icon"
        webIcon.src = "resources/site-alt.svg"
        webIcon.height = 16
        webIcon.width = 16
        const trashIcon = document.createElement("img")
        trashIcon.className = "flat-icon"
        trashIcon.src = "resources/trash-xmark.svg"
        trashIcon.height = 16
        trashIcon.width = 16
        const upIcon = document.createElement("img")
        upIcon.className = "flat-icon"
        upIcon.src = "resources/angle-small-up.svg"
        upIcon.height = 16
        upIcon.width = 16
        const downIcon = document.createElement("img")
        downIcon.className = "flat-icon"
        downIcon.src = "resources/angle-small-down.svg"
        downIcon.height = 16
        downIcon.width = 16
        if (existsSync(mod.path))
            try {
                const modData = JSON.parse(readFileSync(mod.path))

                add("b", `${modData.name}`, "1", "1")
                add("small", ` v${modData.version}`, "1", "2")

                if (mod.git) {
                    add("small", " (Git)", "1", "3")
                }
                else {
                    add("small", " (Local)", "1", "3")
                }

                addIconButton(downIcon, () => move(1), config.mods[config.mods.length - 1] === mod, "mod-controls", "1", "4")
                addIconButton(upIcon, () => move(-1), config.mods[0] === mod, "mod-controls", "1", "5")

                addIconButton(webIcon, () => {
                    shell.openExternal(modData.url)
                }, !modData.url, "mod-controls", "1", "6")

                addIconButton(desktopIcon, () => {
                    const i = Math.max(mod.path.lastIndexOf("/"), mod.path.lastIndexOf("\\"));
                    if (i !== -1) shell.openExternal(mod.path.substring(0, i + 1));
                }, false, "mod-controls", "1", "7");

                addIconButton(trashIcon, () => {
                    const ind = config.mods.indexOf(mod)
                    config.mods.splice(ind, 1)
                    reload()
                    updateHidden()
                }, false, "mod-controls", "1", "8")

                add("small", `by ${modData.authors.join(", ")} `, "2", "1/3")

                if (modData.updateUrl) {
                    if (mod.latestVersion != undefined && mod.latestVersion != modData.version) {
                        addButton(`v${mod.latestVersion} available!`, () => {
                            if (mod.git) {
                                ipcRenderer.send("updateGitMod", mod.path, mod.git)
                            } else {
                                shell.openExternal(mod.url || modData.downloadUrl || modData.url || modData.updateUrl)
                            }
                        }, false, "blink")
                        add("span", " ")
                    }

                    if (mod.lastCheck == undefined || mod.lastCheck < Date.now() - 3 * 60 * 60 * 1000)
                        try {
                            mod.lastCheck = Date.now()
                            addLog("log", new Date(), `Checking for updates of ${modData.name}`)
                            fetch(modData.updateUrl)
                                .then((result) => result.json())
                                .then((result) => {
                                    const oldVersion = mod.latestVersion
                                    mod.latestVersion = result.version
                                    mod.url = result.downloadUrl || result.url || result.updateUrl

                                    if (oldVersion !== result.version)
                                        updateHidden()

                                    ipcRenderer.send("setConfig", config)
                                })
                        } catch (error) {
                            addLog("error", new Date(), `Failed to check for updates of mod ${mod.name} at ${mod.updateUrl}`)
                        }
                }

                if (modData.requireScripts && !mod.allowScripts) {
                    const resp = confirm(`The mod '${modData.name}' (${mod.path}) requires scripts to be enabled. Do you trust this mod?`)
                    if (!resp) {
                        const ind = config.mods.indexOf(mod)
                        config.mods.splice(ind, 1)
                        reload()
                        updateHidden()
                        addLog("error", new Date(), "The mod has been removed.")
                    }
                    mod.allowScripts = true

                    ipcRenderer.send("setConfig", config)
                    ipcRenderer.send("reloadModCache")
                }

            } catch (error) {
                addLog("error", error)
                elem.innerText = "Failed to load metadata: "
                const path = document.createElement("code")
                path.innerText = mod.path
                elem.appendChild(path)
            }
        else {
            elem.innerText = "Missing file (moved or deleted?): "
            const path = document.createElement("code")
            path.innerText = mod.path

            addIconButton(trashIcon, () => {
                const ind = config.mods.indexOf(mod)
                config.mods.splice(ind, 1)
                reload()
                updateHidden()
            }, false, "mod-controls")

            elem.appendChild(path)
        }
    }

}

/** @type {Set<string>} */
let helpSequence = undefined
const help = {
    startedHelp: {
        show: ["not-started", "loading", "no-connection"]
    },
    connected: {
        hide: ["no-connection"],
        show: ["no-connection-with-gadget"]
    },
    gadgetFail: {
        hide: ["no-connection-with-gadget", "not-started"],
        show: ["no-cache"]
    },
    gadgetHit: {
        hide: ["no-connection-with-gadget", "no-cache"],
        show: ["no-index"]
    },
    indexHit: {
        hide: ["no-index", "not-started"],
        show: ["no-main"]
    },
    mainHit: {
        hide: ["no-main"],
        show: ["no-version"]
    },
    versionHit: {
        hide: ["no-version"],
        show: ["done"]
    }
}
/**
 * Update help information
 */
function updateHelp(toUpdate) {
    if (toUpdate == "startedHelp") {
        ipcRenderer.send("startHelp")
        helpSequence = new Set()
    }
    const len = helpSequence.size
    if (!helpSequence) return
    if (toUpdate) helpSequence.add(toUpdate)
    if (helpSequence.size <= len) return
    document.getElementById("help").style = ""

    ;["not-started",
      "loading",
      "no-connection",
      "no-connection-with-gadget",
      "no-cache",
      "no-index",
      "no-main",
      "no-version",
      "done"].forEach(el => document.getElementById(el).style = "display: none;")

    for (const item of helpSequence) {
        if (help[item].show)
            help[item].show.forEach((el) => document.getElementById(el).style = "")
        if (help[item].hide)
            help[item].hide.forEach((el) => document.getElementById(el).style = "display: none;")
    }

    if (helpSequence.has("mainHit") && helpSequence.has("versionHit"))
        document.getElementById("loading").style = "display: none;"
}

function getModPath() {
    return config.mods.length > 0 ? join(config.mods[config.mods.length - 1].path, "..") : undefined
}
function getImgCachePath() {
    let cachePath = config.cacheLocation
    if (config.cacheLocation == undefined || config.cacheLocation == "default")
        cachePath = join(remote.app.getPath("userData"), "ProxyData", "cache")
    cachePath = join(cachePath, "kcs2", "img")
    return cachePath
}
for (const type of ["importCache", "reloadCache", "prepatch"])
    document.getElementById(type).onclick = () => ipcRenderer.send(type)

document.getElementById("openCache").addEventListener("click", () => {
    shell.openExternal(join(remote.app.getPath("userData"), "ProxyData", "cache"))
})

document.getElementById("checkVersion").addEventListener("click", () => {
    ipcRenderer.send("checkVersion")
})

document.getElementById("createDiff").onclick = async () => {
    const source = await remote.dialog.showOpenDialog({
        title: "Select old cache or cached.json",
        filters: [{
            name: "Valid files",
            extensions: ["zip", "json"]
        }],
        properties: ["openFile"]
    })
    if (source.canceled) return

    const n = new Date(), f = d => d.toString().padStart(2, 0)
    const target = await remote.dialog.showSaveDialog({
        title: "Select new zip",
        defaultPath: `cache-diff-${n.getFullYear()}-${f(n.getMonth() + 1)}-${f(n.getDate())}.zip`,
        filters: [{
            name: ".zip files",
            extensions: ["zip"]
        }],
        properties: []
    })
    if (target.canceled) return

    ipcRenderer.send("createDiff", source.filePaths[0], target.filePath)
}

document.getElementById("importCustomCache").onclick = async () => {
    const response = await remote.dialog.showOpenDialog({
        title: "Select cache zip",
        filters: [{
            name: ".zip files",
            extensions: ["zip"]
        }],
        properties: ["openFile"]
    })
    if (response.canceled) return
    ipcRenderer.send("importCache", response.filePaths[0])
}

document.getElementById("verifyCache").onclick = async () => {
    const response = await remote.dialog.showMessageBox({
        title: "Delete invalid files?",
        buttons: ["Cancel", "Delete", "Keep"],
        message: "Delete invalid files?",
        detail: "Cached files created in an old version might count as invalid and will be deleted."
    })
    if (!response.response) return
    ipcRenderer.send("verifyCache", response.response == 1)
}

document.getElementById("preload").onclick = async () => {
    const response = await remote.dialog.showMessageBox({
        title: "Include rarer files",
        buttons: ["Cancel", "Include rarely updated files", "More common files"],
        message: "Full scan?",
        detail: "Doing a full scan might take a while since a lot will 404."
    })
    if (!response.response) return
    ipcRenderer.send("preload", response.response == 1)
}

document.getElementById("addMod").onclick = async () => {
    const response = await remote.dialog.showOpenDialog({
        title: "Select a mod metadata file",
        filters: [{
            name: "Mod metadata",
            defaultPath: getModPath(),
            extensions: ["mod.json"]
        }],
        properties: ["openFile"]
    })
    if (response.canceled) return

    if (config.mods.map(m => m.path).includes(response.filePaths[0])) {
        addLog("error", new Date(), "Already added")
        return
    }
    config.mods.push({ path: response.filePaths[0] })
    ipcRenderer.send("setConfig", config)
    ipcRenderer.send("reloadModCache")
    updateHidden()
}
document.getElementById("reloadMods").onclick = () => {
    updateHidden()
    ipcRenderer.send("reloadModCache")
}

document.getElementById("installGitMod").onclick = () => {
    const gitModInstall = document.getElementById("gitModInstall")
    gitModInstall.style.display = gitModInstall.style.display === "none" ? "block" : "none"
    if (gitModInstall.style.display === "none")
        return
    const getEnglishPatchButton = document.getElementById("getEnglishPatch")
    getEnglishPatchButton.style.display = englishPatchInstalled ? "none" : "inline-block"
}

ipcRenderer.on("gitModUpdated", (event, result) => {
    let notification = new Notification({
        title: "KCCacheProxy: " + (result.success ? "Mod Updated" : "Mod Update Failed"),
        body: result.success
            ? `${result.modMeta.name} has been updated to version ${result.modMeta.version}.`
            : `Failed to update mod at ${result.modPath}. ${result.error}`,
            timeoutType: "default",
            silent: false,
    })
    notification.show()

    addLog("info", new Date(), result.success ? "Git mod downloaded successfully." : "Failed to download git mod.")
    if (result.success) {
        ipcRenderer.send("getConfig")
    }
})

document.getElementById("confirmGitModInstall").onclick = () => {
    const urlInput = document.getElementById("gitModUrl")
    const url = urlInput.value.trim()
    if (!url) return

    try {
        addLog("info", new Date(), `Installing mod from ${url}...`)
        ipcRenderer.send("installGitMod", url)
        urlInput.value = ""
        document.getElementById("gitModInstall").style.display = "none"
    } catch (error) {
        addLog("error", new Date(), `Failed to install mod: ${error}`)
    }
}

document.getElementById("getEnglishPatch").onclick = () => {
    const urlInput = document.getElementById("gitModUrl")

    try {
        addLog("info", new Date(), `Installing mod from https://github.com/Oradimi/KanColle-English-Patch-KCCP.git...`)
        ipcRenderer.send("installGitMod", "https://github.com/Oradimi/KanColle-English-Patch-KCCP.git")
        urlInput.value = ""
        document.getElementById("gitModInstall").style.display = "none"
        englishPatchInstalled = true
    } catch (error) {
        addLog("error", new Date(), `Failed to install mod: ${error}`)
    }
}

document.getElementById("cancelGitModInstall").onclick = () => {
    document.getElementById("gitModUrl").value = ""
    document.getElementById("gitModInstall").style.display = "none"
}

document.getElementById("extractSpritesheet").onclick = async () => {
    const cachePath = getImgCachePath()
    const source = await remote.dialog.showOpenDialog({
        title: "Select a spritesheet",
        defaultPath: cachePath,
        filters: [{
            name: "Spritesheet image",
            extensions: ["png"]
        }],
        properties: ["openFile"]
    })
    if (source.canceled) return

    const target = await remote.dialog.showOpenDialog({
        title: "Select a folder to extract to",
        defaultPath: getModPath(),
        properties: ["openDirectory"]
    })
    if (target.canceled) return

    ipcRenderer.send("extractSpritesheet", source.filePaths[0], target.filePaths[0])
}
document.getElementById("outlines").onclick = async () => {
    const cachePath = getImgCachePath()
    const source = await remote.dialog.showOpenDialog({
        title: "Select a spritesheet",
        defaultPath: cachePath,
        filters: [{
            name: "Spritesheet image",
            extensions: ["png"]
        }],
        properties: ["openFile"]
    })
    if (source.canceled) return

    const target = await remote.dialog.showSaveDialog({
        title: "Select a location to save outlines to",
        defaultPath: getModPath(),
        filters: [{
            name: "Images",
            extensions: ["png"]
        }]
    })
    if (target.canceled) return

    ipcRenderer.send("outlines", source.filePaths[0], target.filePath)
}
document.getElementById("importExternalMod").onclick = async () => {
    const source = await remote.dialog.showOpenDialog({
        title: "Select cache folder to import from",
        defaultPath: getModPath(),
        properties: ["openDirectory"]
    })
    if (source.canceled) return

    const target = await remote.dialog.showOpenDialog({
        title: "Select a folder to export to",
        defaultPath: getModPath(),
        properties: ["openDirectory"]
    })
    if (target.canceled) return

    ipcRenderer.send("importExternalMod", source.filePaths[0], target.filePaths[0])
}

document.getElementById("startHelp").addEventListener("click", () => {
    updateHelp("startedHelp")
})
document.getElementById("stopHelp").onclick = () => {
    helpSequence = undefined
    document.getElementById("help").style = "display:none;"
}

for (const elem of document.getElementsByClassName("link")) {
    elem.onclick = (e) => {
        e.preventDefault()
        if (elem.href)
            shell.openExternal(elem.href)
    }
}
document.getElementById("openConfigWiki").onclick = () => shell.openExternal(`${BASEURL}/wiki/Configuration`)
document.getElementById("openFAQ").onclick = () => shell.openExternal(`${BASEURL}/wiki/FAQ`)
document.getElementById("openCacheDump").onclick = () => shell.openExternal(`${BASEURL}/wiki/Installation-and-setup#using-cache-dumps`)
document.getElementById("openAssetsWiki").onclick = () => shell.openExternal(`${BASEURL}/wiki/Asset-patching`)

ipcRenderer.send("getRecent")
ipcRenderer.send("getConfig")

document.title = document.getElementById("checkVersion").innerText = `KCCacheProxy v${remote.app.getVersion()}`
