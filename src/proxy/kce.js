/* eslint-disable no-console */

/**
 * KanColle English Patch
 * To be used within Docker
 */

const path = require("path")
const cp = require("child_process")
const fs = require("fs")
const { moveSync } = require("fs-extra")
const { getConfig, setConfig } = require("./config")
const { reloadModCache } = require("./mod/patcher")

async function add() {
    const zipFileName = "KanColle-English-Patch-KCCP-master.zip"
    const manifestFileName = "EN-patch.mod.json"
    const assetDir = "EN-patch"
    const config = getConfig()
    console.log(JSON.stringify(config, null, 2))

    // =====
    console.log("Downloading...")
    console.time("Time")
    fs.rmSync(zipFileName, { force: true })
    cp.spawnSync("curl", ["-LJO", "https://github.com/Oradimi/KanColle-English-Patch-KCCP/archive/refs/heads/master.zip"])
    console.timeEnd("Time")

    // =====
    console.log("Extracting...")
    console.time("Time")
    cp.spawnSync("unzip", [zipFileName])
    console.timeEnd("Time")

    // =====
    console.log("Applying...")
    console.time("Time")
    const tmpDir = path.join("KanColle-English-Patch-KCCP-master")
    const dstDir = path.join(config.cacheLocation, "mods", "kce")
    const manifestFilePath = path.join(dstDir, manifestFileName)
    fs.mkdirSync(dstDir, { recursive: true })
    moveSync(
        path.join(tmpDir, manifestFileName),
        path.join(dstDir, manifestFileName),
        { overwrite: true },
    )
    const manifest = JSON.parse(fs.readFileSync(manifestFilePath, "utf8"))
    console.log(JSON.stringify(manifest, null, 2))
    moveSync(
        path.join(tmpDir, assetDir),
        path.join(dstDir, assetDir),
        { overwrite: true },
    )
    config.mods = []
    config.mods.push({
        path: manifestFilePath,
        lastCheck: Date.now(),
        allowScripts: true,
        latestVersion: manifest.version,
        url: manifest.downloadUrl || manifest.url || manifest.updateUrl,
    })
    config.enableModder = true
    console.log(JSON.stringify(config, null, 2))
    await setConfig(config, true)
    await reloadModCache()
    console.timeEnd("Time")

    // =====
    console.log("Cleaning...")
    console.time("Time")
    fs.rmSync(zipFileName, { force: true })
    fs.rmdirSync(tmpDir, { recursive: true })
    console.timeEnd("Time")
}

async function remove() {
    const config = getConfig()
    config.mods = []
    config.enableModder = false
    await setConfig(config, true)
    await reloadModCache()
}

async function toggle() {
    const config = getConfig()
    config.enableModder = !config.enableModder
    await setConfig(config, true)
    await reloadModCache()
}

async function bootstrap() {
    const [, , cmd] = process.argv

    if (!cmd) {
        console.warn("command not found")
        process.exit(1)
    }

    if (cmd === "add") {
        await add()
        return
    }

    if (cmd === "remove") {
        await remove()
        return
    }

    if (cmd === "toggle") {
        await toggle()
        return
    }

    console.error("command invalid")
    process.exit(1)
}

bootstrap()
