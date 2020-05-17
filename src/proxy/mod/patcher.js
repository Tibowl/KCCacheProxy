const { join } = require("path")
const { readdir, stat, exists, readFile } = require("fs-extra")
const Jimp = require("./jimp")
const crypto = require("crypto")

const Logger = require("./../ipc")
const { getConfig } = require("./../config")
const { cacheModded, checkCached } = require("./patchedcache")

/**
 * @typedef {Object} Patched
 * @property {import("jimp")} img
 * @property {any} hash
 */
/**
 * @typedef {Object} Patch
 * @property {Object.<string, Patched>} original
 * @property {Object.<string, Patched>} patched
 * */

/** @type {Object.<string, Patch>} */
let modCache = undefined
async function reloadModCache() {
    if (!getConfig().enableModder) return
    const startTime = Date.now()
    modCache = {}

    for (const mod of getConfig().mods) {
        const modDir = mod.replace(/\.mod\.json$/, "")
        Logger.log("Preparing", modDir)
        await prepareDir(modDir)
    }

    Logger.log("Preparing mod images took", Date.now() - startTime, "ms")
}

async function prepareDir(dir, path = []) {
    await Promise.all((await readdir(dir)).map(async f => {
        const stats = await stat(join(dir, f))
        if (stats.isDirectory())
            await prepareDir(join(dir, f), [...path, f])
        else if (stats.isFile() && f.endsWith(".png")) {
            let type = path[path.length-1]
            let target, targetName = f

            if (type !== "original" && type !== "patched") {
                if (f.startsWith("original")) type = "original"
                else if (f.startsWith("patched")) type = "patched"
                else {
                    Logger.error(`Invalid path ${join(dir, f)}`)
                    return
                }

                targetName = targetName.replace(/^(original|patched)/, "")
                target = "/" + path.join("/")
            } else
                target = "/" + path.slice(0, path.length-1).join("/")

            if (!modCache[target])
                modCache[target] = {}
            if (!modCache[target][type])
                modCache[target][type] = {}

            // Logger.log(target, type, f)
            const img = await Jimp.read(join(dir, f))
            // eslint-disable-next-line require-atomic-updates
            modCache[target][type][targetName] = {
                img, hash: img.pHash()
            }
        }
    }))
}

/**
 * If necesarry, will patch the file
 *
 * @param {string} file File path
 * @param {string|Buffer} contents Contents of file
 * @param {string} cacheFile Cache file locatio
 * @param {any} cachedFile Cache metadata
 */
async function patch(file, contents, cacheFile, cachedFile) {
    if (!file.toLowerCase().endsWith(".png"))
        return contents

    if (modCache === undefined)
        await reloadModCache()

    return await getModified(file, contents, cacheFile, cachedFile)
}


/**
 * @typedef PatchObject
 * @property {import("jimp")} imgOriginal
 * @property {import("jimp")} imgPatched
 * @property {string} hash
 * @property {string} name
 */

/**
 * Patch an asset, returns patched asset
 *
 * @param {string} file File path
 * @param {string|Buffer} contents Contents of file
 * @param {string} cacheFile Cache file location
 * @param {any} cachedFile Cache metadata
 */
async function getModified(file, contents, cacheFile, cachedFile) {
    const startTime = Date.now()

    // Get relevant patches
    /** @type {PatchObject[]} */
    const patches = []
    const patchHashes = []
    const paths = file.split("/")
    while (paths.length > 1) {
        const patch = modCache[paths.join("/")]
        if (patch) {
            for (const [name, {hash, img}] of Object.entries(patch.original))  {
                if (!patch.patched[name]) {
                    Logger.error(`Missing ${name} in patched - delete original file if no patch needed!`)
                    continue
                }
                patchHashes.push(patch.patched[name].hash)
                patches.push({imgOriginal: img, hash, imgPatched: patch.patched[name].img, name})
            }
        }
        paths.pop()
    }
    const patchHash = crypto.createHash("md5").update(patchHashes.sort().join()).digest("base64")

    // No patching required
    if (patches.length === 0) return contents

    const cached = await checkCached(file, patchHash, cachedFile.lastmodified)
    if (cached) return cached

    Logger.log(`Need to repatch ${file}`)

    const spritesheet = await patchAsset(cacheFile,  await Jimp.read(contents), patches)

    const output = await spritesheet.getBufferAsync(Jimp.MIME_PNG)
    cacheModded(file, output, patchHash, cachedFile.lastmodified)
    Logger.log(`Patching ${file} took ${Date.now() - startTime} ms`)
    return output
}

/**
 *
 * @param {string} cacheFile Cache file location
 * @property {import("jimp")} spritesheet
 * @param {PatchObject[]} patches
 */
async function patchAsset(cacheFile, spritesheet, patches) {
    const spritesheetMeta = cacheFile.replace(/\.png$/, ".json")
    if (!await exists(spritesheetMeta)) {
        const potentionalPatches = patches.filter(patch => patch.imgOriginal.getWidth() == spritesheet.getWidth() && patch.imgOriginal.getHeight() == spritesheet.getHeight())
        if (potentionalPatches.length == 0) return spritesheet
        const oriHash = spritesheet.pHash()
        for (const { hash, imgOriginal, imgPatched } of potentionalPatches) {
            const dist = Jimp.compareHashes(oriHash, hash)
            if (dist > 0.01) continue
            const diff = Jimp.diff(imgOriginal, spritesheet)
            if (diff.percent > 0.01) continue

            return imgPatched
        }

        return spritesheet
    }

    const meta = JSON.parse(await readFile(spritesheetMeta))

    for (const {frame: {x, y, w, h}} of Object.values(meta.frames)) {
        if (patches.length == 0) break

        const potentionalPatches = patches.filter(patch => patch.imgOriginal.getWidth() == w && patch.imgOriginal.getHeight() == h)
        if (potentionalPatches.length == 0) continue

        const toReplace = spritesheet.clone().crop(x, y, w, h)
        const oriHash = toReplace.pHash()

        for (const [k, patchInfo] of Object.entries(patches)) {
            if (!potentionalPatches.includes(patchInfo)) continue
            const { hash, imgOriginal, imgPatched } = patchInfo

            const dist = Jimp.compareHashes(oriHash, hash)
            if (dist > 0.01) continue
            const diff = Jimp.diff(imgOriginal, toReplace)
            if (diff.percent > 0.01) continue
            patches.splice(k, 1)

            spritesheet.mask(new Jimp(w, h, 0x0), x, y).composite(imgPatched, x, y)
            break
        }
    }
    return spritesheet
}

module.exports = { patch, reloadModCache }
