const { join } = require("path")
const { readdir, stat, exists, readFile } = require("fs-extra")
const Jimp = require("./jimp")
const crypto = require("crypto")
const { mapLimit } = require("async")

const Logger = require("./../ipc")
const cacher = require("./../cacher")
const { getConfig, getCacheLocation } = require("./../config")
const { cacheModded, checkCached, loadCached } = require("./patchedcache")
const { diff } = require("./imgdiff")

/**
 * @typedef {Object} Patched
 * @property {string} path
 * @property {number} [w]
 * @property {number} [h]
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

    for (const { path, allowScripts } of getConfig().mods) {
        const modDir = path.replace(/\.mod\.json$/, "")

        const meta = JSON.parse(await readFile(path))
        if (meta.requireScripts && !allowScripts) continue

        Logger.log("Preparing", modDir)
        await prepareDir(modDir, meta, allowScripts && meta.requireScripts)
    }

    Logger.log("Preparing mod images took", Date.now() - startTime, "ms")
    loadCached()
}

async function prepareDir(dir, modMeta, allowScripts, path = []) {
    await Promise.all((await readdir(dir)).map(async f => {
        if (f.startsWith(".") || f.toLowerCase().endsWith(".md")) return
        const filePath = join(dir, f)
        const stats = await stat(filePath)

        if (stats.isDirectory())
            await prepareDir(filePath, modMeta, allowScripts, [...path, f])
        else if (stats.isFile()) {
            let type = path[path.length - 1]
            let target, targetName = f + (modMeta.name || "") + (modMeta.version || "")

            if (type !== "original" && type !== "patched" && type !== "patcher" && type !== "ignore") {
                if (f.startsWith("original")) type = "original"
                else if (f.startsWith("patched")) type = "patched"
                else if (f.startsWith("patcher")) type = "patcher"
                else if (f.startsWith("ignore")) return
                else {
                    Logger.error(`Invalid path ${filePath}`)
                    return
                }

                targetName = targetName.replace(/^(original|patched|patcher)/, "")
                target = "/" + path.join("/")
            } else
                target = "/" + path.slice(0, path.length - 1).join("/")

            if (type == "ignore")
                return
            else if (type == "patcher") {
                if (!allowScripts) return
                // TODO: find a more elegant solution for this
                // eval() to get around webpack messing with dynamic require.resolve
                const req = eval("require.resolve(filePath)")
                delete require.cache[req]
            }

            if (!modCache[target])
                modCache[target] = {}
            if (!modCache[target][type])
                modCache[target][type] = {}

            modCache[target][type][targetName] = { path: filePath }
        }
    }))
}

/**
 * If necessary, will patch the file
 *
 * @param {string} file File path
 * @param {string|Buffer} contents Contents of file
 * @param {string} cacheFile Cache file location
 * @param {any} cachedFile Cache metadata
 */
async function patch(file, contents, cacheFile, cachedFile) {
    if (modCache === undefined)
        await reloadModCache()

    const patches = []
    const patchHashes = crypto.createHash("md5")
    const paths = file.split("/")
    while (paths.length > 1) {
        const patch = modCache[paths.join("/")]
        if (patch) {
            if (patch.patcher)
                for (const [name, { path }] of Object.entries(patch.patcher).sort(([a], [b]) => a.localeCompare(b))) {
                    const content = await readFile(path)
                    patchHashes.update(content)
                    patches.push({ patcher: require(path), name })
                }

            if (patch.original)
                for (const [name, { path }] of Object.entries(patch.original).sort(([a], [b]) => a.localeCompare(b))) {
                    if (!patch.patched[name]) {
                        Logger.error(`Missing ${name} in patched - delete original file if no patch needed!`)
                        continue
                    }
                    const content = await readFile(patch.patched[name].path)
                    patchHashes.update(content)
                    patches.push({ original: path, patched: content, name })
                }
        }
        paths.pop()
    }

    // No patching required
    if (patches.length === 0) return contents

    const patchHash = patchHashes.digest("base64")

    if (contents == undefined) contents = await readFile(cacheFile)

    return await getModified(file, contents, cacheFile, cachedFile, patches, patchHash)
}


/**
 * @typedef PatchObject
 * @property {string | Buffer} original
 * @property {string | Buffer} patched
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
async function getModified(file, contents, cacheFile, cachedFile, patches, patchHash) {
    const startTime = Date.now()

    // Patch by patchers (scripts)
    let patcherPatched = false
    for (const { patcher } of patches.filter(k => k.patcher)) {
        const result = patcher(file, contents)
        if (result !== null) {
            patcherPatched = true
            contents = result
        }
    }
    if (patcherPatched)
        return contents

    patches = patches.filter(k => !k.patcher)

    // Patch non image files
    if (!file.toLowerCase().endsWith(".png")) {
        for (const patch of patches)
            if ((await readFile(patch.original)).equals(contents))
                return patch.patched

        return contents
    }

    // Return cached image files
    const cached = await checkCached(file, patchHash, cachedFile.lastmodified)
    if (cached) return cached

    Logger.log(`Need to re-patch ${file}`)

    // Patching sprite sheets
    const spritesheet = await patchAsset(cacheFile, await Jimp.read(contents), patches)

    const output = spritesheet.out ? spritesheet.out : await spritesheet.sc.getBufferAsync(Jimp.MIME_PNG)
    cacheModded(file, output, patchHash, cachedFile.lastmodified)
    Logger.log(`Patching ${file} took ${Date.now() - startTime} ms`)
    return output
}

/**
 *
 * @param {string} cacheFile Cache file location
 * @property {import("@jimp/core").default} spritesheet
 * @param {PatchObject[]} patches
 */
async function patchAsset(cacheFile, spritesheet, patches) {
    const spritesheetMeta = cacheFile.replace(/\.png$/, ".json")

    patches = await Promise.all(patches.map(async p => {
        const img = await Jimp.read(p.original)
        return {
            ...p,
            w: img.getWidth(),
            h: img.getHeight(),
            imgOriginal: img
        }
    }))

    if (!await exists(spritesheetMeta)) {
        const potentialPatches = patches.filter(patch => patch.w == spritesheet.getWidth() && patch.h == spritesheet.getHeight())
        if (potentialPatches.length == 0) return { sc: spritesheet }

        for (const { imgOriginal, patched } of potentialPatches) {
            if (diff(imgOriginal, spritesheet) > 0.01) continue
            return { out: patched }
        }

        return { sc: spritesheet }
    }

    const meta = JSON.parse(await readFile(spritesheetMeta))

    for (const { frame: { x, y, w, h } } of Object.values(meta.frames)) {
        if (patches.length == 0) break

        const potentialPatches = patches.filter(patch => patch.w == w && patch.h == h)
        if (potentialPatches.length == 0) continue

        // Clone takes quite a while
        const toReplace = spritesheet.clone().crop(x, y, w, h)

        for (const [k, patchInfo] of Object.entries(patches)) {
            if (!potentialPatches.includes(patchInfo)) continue
            const { imgOriginal, patched } = patchInfo

            if (diff(imgOriginal, toReplace) > 0.01) continue
            patches.splice(k, 1)

            spritesheet.mask(new Jimp(w, h, 0x0), x, y).composite(await Jimp.read(patched), x, y)
            break
        }
    }

    return { sc: spritesheet }
}

async function prepatch() {
    const start = Date.now()

    const responses = await mapLimit(
        Object.entries(cacher.getCached()).filter(k => k[0].endsWith(".png")),
        2,
        async ([key, value]) => {
            try {
                const filePath = join(getCacheLocation(), key)
                const patchedContents = await patch(key, undefined, filePath, value)
                if (patchedContents) return 1
                return 0
            } catch (e) {
                return -1
            }
        }
    )

    const total = responses.length,
          checked = responses.filter(k => k > 0).length,
          error = responses.filter(k => k == -1).length

    Logger.log(`Done after ${Date.now() - start}ms, ${checked} files have been patched out of ${total} .png files, failed to patch ${error} files`)
}

module.exports = { patch, reloadModCache, prepatch }
