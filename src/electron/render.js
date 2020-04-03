/* eslint-disable no-undef */
const { ipcRenderer } = require ("electron")

let recent = []

const log = document.getElementById("log")
function addNew(message) {
    while (recent.length >= 50) {
        log.removeChild(log.children[log.children.length-1])
        recent.pop()
    }

    recent.unshift(message)

    const messageDate = message.shift()
    const messageType = message.shift()

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
        "input": {
            "type": "number",
            "min": 1,
            "max": 65536,
            "title": "Port used by proxy. You'll need to save and restart to apply changes."
        }
    },
    "cacheLocation": {
        "label": "Cache location",
        "input": {
            "type": "text",
            "title": "Cache location used by proxy. You'll need to save to apply changes"
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
        input.value = config[key]
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
        if (input.value != config[key])
            foundDifferent = true

        if(settable[key].input.type == "number")
            newConfig[key] = +input.value
        else
            newConfig[key] = input.value
    }
    saveButton.disabled = !foundDifferent
    saveButton.onclick = saveConfig
}

function saveConfig() {
    ipcRenderer.send("setConfig", newConfig)
    config = newConfig
    saveButton.disabled = true
}

ipcRenderer.on("log", (event, message) => addNew(message))
ipcRenderer.on("error", (event, message) => addNew(message))
ipcRenderer.on("recent", (event, message) => {
    recent = []
    log.innerHTML = ""
    message.reverse().forEach(m => addNew(m))
})
ipcRenderer.on("config", (event, message) => {
    updateConfig(message)
})

ipcRenderer.send("getRecent")
ipcRenderer.send("getConfig")
