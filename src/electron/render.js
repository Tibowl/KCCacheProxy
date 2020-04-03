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

ipcRenderer.on("log", (event, message) => addNew(message))
ipcRenderer.on("error", (event, message) => addNew(message))
ipcRenderer.on("recent", (event, message) => {
    recent = []
    log.innerHTML = ""
    message.forEach(m => addNew(m))
})

ipcRenderer.send("getRecent")
