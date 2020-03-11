const { ipcRenderer } = require ("electron")

ipcRenderer.on ("message", (event, message) => { console.log(event, message) })
