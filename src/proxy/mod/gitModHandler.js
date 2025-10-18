const git = require("isomorphic-git")
const fs = require("fs")
const { join, dirname } = require("path")
const { existsSync } = require("fs-extra")
const Logger = require("../ipc")
const { reloadModCache } = require("./patcher")
const http = require("isomorphic-git/http/node")
const { readFile } = require("fs/promises")
const { Notification } = require("electron")

const logSource = "kccp-git"
let lastLogTime = 0
let lastPhase = ""

function onProgress(progress) {
    const percent = ((progress.loaded / progress.total) * 100).toFixed(2)
    const now = Date.now()
    const shouldLog = progress.phase !== lastPhase || // Log if phase changed
        progress.loaded === progress.total || // Log if complete
        now - lastLogTime >= 1000 // Log if more than 1 second since last log

    if (shouldLog) {
        Logger.log(logSource, `${progress.phase}: ${percent}% [${progress.loaded}/${progress.total}]`)
        lastLogTime = now
        lastPhase = progress.phase
    }
}

async function handleModInstallation(modsPath, url, config, configManager) {
    try {
        // Extract repo name from URL
        const repoName = url.split("/").pop().replace(".git", "")
        const modPath = join(modsPath, repoName)

        // Clone repository with depth=1 (shallow clone)
        await git.clone({
            fs,
            http,
            dir: modPath,
            url,
            depth: 1,
            singleBranch: true,
            onProgress: onProgress
        })

        // Find any .mod.json file in the repository root
        const files = fs.readdirSync(modPath)
        const modConfigFile = files.find(f => f.endsWith(".mod.json"))
        const modConfigPath = modConfigFile ? join(modPath, modConfigFile) : null

        if (!modConfigPath || !existsSync(modConfigPath)) {
            Logger.error(logSource, `No .mod.json file found in repository: ${url}`)
            return false
        }

        const currentConfig = config
        if (currentConfig.mods.map(m => m.path).includes(modConfigPath)) {
            Logger.error(logSource, "Mod already installed")
            return false
        }

        currentConfig.mods.push({ path: modConfigPath, git: url })
        configManager.setConfig(currentConfig, true)
        await reloadModCache()
        return true
    } catch (err) {
        Logger.error(logSource, `Failed to install mod: ${err}`)
        return false
    }
}

async function updateMod(modPath, gitRemote) {
    const repoPath = dirname(modPath)
    const cache = {}

    try {
        Logger.log(logSource, `Updating mod from ${gitRemote}...`)
        const serverRefs = await git.listServerRefs({
            fs,
            http,
            dir: repoPath,
            url: gitRemote,
            cache
        })

        const currentOid = await git.resolveRef({
            fs,
            dir: repoPath,
            ref: "HEAD",
            cache
        })

        const targetOid = serverRefs[0].oid
        if (currentOid === targetOid) {
            Logger.log(logSource, "Mod is already up to date.")
            return false
        }

        Logger.log(logSource, `Updating to commit ${targetOid}...`)

        // Fetch latest changes
        await git.fetch({
            fs,
            http,
            dir: repoPath,
            url: gitRemote,
            singleBranch: true,
            ref: targetOid,
            cache,
            onProgress: onProgress
        })

        Logger.log(logSource, "Updating files...")
        await git.checkout({
            fs,
            dir: repoPath,
            ref: targetOid,
            force: true,
            cache,
            onProgress: onProgress
        })

        const modMeta = JSON.parse(await readFile(modPath, "utf-8"))
        const notification = new Notification({
            title: "KCCacheProxy: Mod Updated",
            body: `${modMeta.name} has been updated to version ${modMeta.version}.`,
            timeoutType: "default",
            silent: false,
        })
        notification.show()

        return true
    } catch (error) {
        Logger.error(logSource, "Error updating mod:", error)
        return false
    }
}

module.exports = {
    updateMod,
    handleModInstallation
}
