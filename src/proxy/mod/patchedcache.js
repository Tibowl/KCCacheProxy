const { join, dirname } = require("path")
const { exists, readFile, remove, rename, ensureDir, writeFile, move } = require("fs-extra")

const Logger = require("./../ipc")
const { getCacheLocation } = require("./../config")

let cached = undefined
async function loadCached() {
    const CACHE_INFORMATION = join(getCacheLocation(), "mod-cache.json")
    Logger.log(`Loading modded cached from ${CACHE_INFORMATION}.`)

    if (await exists(CACHE_INFORMATION + ".bak")) {
        if (await exists(CACHE_INFORMATION))
            await remove(CACHE_INFORMATION)
        await rename(CACHE_INFORMATION + ".bak", CACHE_INFORMATION)
    }

    if (await exists(CACHE_INFORMATION))
        cached = JSON.parse(await readFile(CACHE_INFORMATION))
    else
        cached = {}
}

async function checkCached(file, patchHash, lastmodified) {
    if (cached == undefined) await loadCached()

    if (!cached[file]) return false
    if (cached[file].lastmodified !== lastmodified) return false
    if (cached[file].patchHash !== patchHash) return false

    const cacheFile = join(getCacheLocation(), "_patched", file)
    if (await exists(cacheFile))
        return await readFile(cacheFile)
    return false
}

async function cacheModded(file, contents, patchHash, lastmodified) {
    if (cached == undefined) await loadCached()

    const cacheFile = join(getCacheLocation(), "_patched", file)

    await ensureDir(dirname(cacheFile))

    if (await exists(cacheFile + ".tmp"))
        await remove(cacheFile + ".tmp")
    await writeFile(cacheFile + ".tmp", contents)
    if (await exists(cacheFile))
        await remove(cacheFile)
    await move(cacheFile + ".tmp", cacheFile)

    // eslint-disable-next-line require-atomic-updates
    cached[file] = {
        lastmodified, patchHash
    }
    queueCacheSave()
}

let saveCachedTimeout = undefined, saveCachedCount = 0

/*
* Queue cache save
*/
function queueCacheSave() {
    if (++saveCachedCount < 25) {
        if (saveCachedTimeout)
            clearTimeout(saveCachedTimeout)
        saveCachedTimeout = setTimeout(forceSave, 5000)
    }
}

/**
* Save cache and clear queued cache save
*/
async function forceSave() {
    if (saveCachedTimeout)
        clearTimeout(saveCachedTimeout)

    saveCachedTimeout = undefined
    saveCachedCount = 0
    await saveCached()
    saveCachedCount = 0
}

/**
* Save cache
*/
async function saveCached() {
    const CACHE_INFORMATION = join(getCacheLocation(), "mod-cache.json")
    const str = JSON.stringify(cached)
    if (str.length == 2)
        return Logger.log(`Cache is empty, not saved to ${CACHE_INFORMATION}`)

    await ensureDir(getCacheLocation())
    if (await exists(CACHE_INFORMATION))
        await move(CACHE_INFORMATION, CACHE_INFORMATION + ".bak")
    await writeFile(CACHE_INFORMATION, str)
    if (await exists(CACHE_INFORMATION + ".bak"))
        await remove(CACHE_INFORMATION + ".bak")

    Logger.log(`Saved mod cache to ${CACHE_INFORMATION}.`)
}


module.exports = { checkCached, cacheModded }
