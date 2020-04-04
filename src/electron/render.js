/* eslint-disable no-undef */
const { ipcRenderer } = require ("electron")

let recent = []

const log = document.getElementById("log")

function update(message) {
    while (recent.length >= 50) {
        log.removeChild(log.children[log.children.length-1])
        recent.pop()
    }

    recent.unshift(message)

    const messageDate = message.shift()
    const messageType = message.shift()

    switch(messageType) {
        case "error":
        case "log":
            addLog(messageType, messageDate, message)
            break
        case "cached":
            document.getElementById("cached").innerText = message
            break
    }
}

function addLog(messageType, messageDate, message) {
    const elem = document.createElement("div")
    elem.className = `loggable ${messageType}`

    const f = (t, l = 2) => t.toString().padStart(l, "0")
    const date = document.createElement("span")
    date.className = "date"
    date.innerText = `${f(messageDate.getHours())}:${f(messageDate.getMinutes())}:${f(messageDate.getSeconds())}.${f(messageDate.getMilliseconds(), 3)}`
    elem.appendChild(date)

    const seperator = document.createElement("span")
    seperator.className = "seperator"
    seperator.innerText = ": "
    elem.appendChild(seperator)

    const msg = document.createElement("span")
    msg.className = "msg"
    msg.innerText = message.map(k => (k && typeof k == "string") ? k : JSON.stringify(k)).join(" ")
    elem.appendChild(msg)

    log.insertBefore(elem, log.firstChild)
}

const settings = document.getElementById("settings")
let config = undefined

const settable = {
    "port": {
        "label": "Port",
        "ifEmpty": "8081",
        "input": {
            "type": "number",
            "min": 1,
            "max": 65536,
            "title": "Port used by proxy. You'll need to save and restart to apply changes."
        }
    },
    "cacheLocation": {
        "label": "Cache location",
        "ifEmpty": "default",
        "input": {
            "type": "text",
            "title": "Cache location used by proxy. You'll need to save to apply changes"
        }
    },
    "startHidden": {
        "label": "Start in system tray",
        "input": {
            "type": "checkbox",
            "title": "Whenever or not window should start in system tray. Don't forget to change before restarting"
        }
    },
    "verifyCache": {
        "label": "Automatically verify cache integrity",
        "input": {
            "type": "checkbox",
            "title": "Whenever or not the proxy should automatically save cache. You'll need to save to apply changes."
        }
    }
}

function updateConfig(c) {
    settings.innerHTML = ""
    config = c

    for (const key of Object.keys(settable)) {
        const value = settable[key]

        const label = document.createElement("label")
        label.innerText = `${value.label}: `
        settings.appendChild(label)
        settings.appendChild(document.createElement("br"))

        const input = document.createElement("input")
        for (const K of Object.keys(value.input))
            input[K] = value.input[K]

        input.id = key
        switch(value.input.type) {
            case "checkbox":
                input.checked = config[key]
                break
            default:
                input.value = config[key]
                break
        }
        input.onchange = checkSaveable
        label.appendChild(input)
    }
}

const saveButton = document.getElementById("save")
let newConfig = config
function checkSaveable() {
    newConfig = JSON.parse(JSON.stringify(config))

    let foundDifferent = false
    for (const key of Object.keys(settable)) {
        const input = document.getElementById(key)
        let value = getValue(key, input)

        if(settable[key].ifEmpty !== undefined && input.value == "")
            value = input.value = newConfig[key] = settable[key].ifEmpty

        if (value != config[key])
            foundDifferent = true

        newConfig[key] = value
    }
    saveButton.disabled = !foundDifferent
    saveButton.onclick = saveConfig

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

function saveConfig() {
    ipcRenderer.send("setConfig", newConfig)
    config = newConfig
    saveButton.disabled = true
}

function verifyCache() {
    ipcRenderer.send("verifyCache")
}
document.getElementById("verifyCache").onclick = verifyCache

function importCache() {
    ipcRenderer.send("importCache")
}
document.getElementById("importCache").onclick = importCache

ipcRenderer.on("update", (e, message) => update(message))
ipcRenderer.on("recent", (e, message) => {
    recent = []
    log.innerHTML = ""
    message.reverse().forEach(m => update(m))
})
ipcRenderer.on("config", (e, message) => {
    updateConfig(message)
})

ipcRenderer.send("getRecent")
ipcRenderer.send("getConfig")
