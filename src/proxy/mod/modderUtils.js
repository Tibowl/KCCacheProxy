/** @type {import("@jimp/core")} */
const Jimp = require("./jimp")
const { exists, readFile, readdir, stat, ensureDir, writeFile } = require("fs-extra")
const { basename, join, extname } = require("path")
const { mapLimit } = require("async")

const { getCacheLocation } = require("./../config")
const Logger = require("./../ipc")
const { diff } = require("./imgdiff")

/**
 * @typedef {Object} Split
 * @property {import("@jimp/core").default} split
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * */
// @property {any} hash

/**
 *
 * @param {import("jimp")} img Image
 * @param {string} fileLocation Location of image file
 * @returns {Split[]} Array of jimps
 */
async function split(spritesheet, fileLocation, extract = true) {
    const spritesheetMeta = fileLocation.replace(/\.png$/, ".json")
    if (!await exists(spritesheetMeta))
        return [{ split: spritesheet }]

    try {
        const meta = JSON.parse(await readFile(spritesheetMeta))
        return Object.values(meta.frames).map(frame => {
            const { frame: { x, y, w, h } } = frame
            const extracted = extract ? spritesheet.clone().crop(x, y, w, h) : undefined
            return {
                x, y, w, h,
                split: extracted,
                // hash: extracted.pHash()
            }
        })
    } catch (error) {
        Logger.error(error)
        return [{ split: spritesheet }]
    }
}


async function outlines(source, target) {
    const startTime = Date.now()
    /** @type {import("@jimp/core").default} */
    const spritesheet = await Jimp.read(source)
    const splits = await split(spritesheet, source, false)

    /** @type {import("@jimp/core").default} */
    const output = new Jimp(spritesheet.getWidth(), spritesheet.getHeight(), 0x0)
    splits.forEach(({ w, h, x, y }) => {
        const tb = new Jimp(w + 2, 1, 0xFF0000FF)
        const lr = new Jimp(1, h + 2, 0xFF0000FF)
        output
            .composite(tb, x - 1, y - 1)
            .composite(tb, x - 1, y + h)
            .composite(lr, x - 1, y - 1)
            .composite(lr, x + w, y - 1)
    })
    output.writeAsync(target)

    Logger.log(`Created outlines in ${Date.now() - startTime}ms`)
}

async function extractSplit(source, target) {
    const startTime = Date.now()
    const spritesheet = await Jimp.read(source)
    const splits = await split(spritesheet, source)
    await Promise.all(splits.map((j, i) => j.split.writeAsync(join(target, `${basename(source).replace(/\.png$/, "")}_${(i + 1).toString().padStart(3, "0")}.png`))))
    Logger.log("Extracted in", Date.now() - startTime, "ms")
}

async function importExternalMod(source, target) {
    const start = Date.now()
    const queue = (await getFiles(source)).filter(k => k.startsWith("kcs"))
    Logger.log(`Discovered ${queue.length} files`)

    const results = await mapLimit(
        queue,
        3,
        async (f) => {
            const startTime = Date.now()

            const fOriginal = join(getCacheLocation(), f)
            const fPatched = join(source, f)

            if (!await exists(fOriginal)) {
                Logger.error(`${fOriginal} not in cache - skipping!`)
                return -1
            }

            if (!f.endsWith(".png")) {
                const cOriginal = await readFile(fOriginal)
                const cPatched = await readFile(fPatched)
                if (!cOriginal.equals(cPatched)) {
                    const p = join(target, f)
                    await ensureDir(p)

                    await writeFile(join(p, `original${extname(f)}`), cOriginal)
                    await writeFile(join(p, `patched${extname(f)}`), cPatched)
                    return 1
                }
                Logger.error(`Warning: ${f} is same as source!`)
                return 0
            }

            const sOriginal = await Jimp.read(fOriginal)
            const sPatched = await Jimp.read(fPatched)

            const aOriginal = await split(sOriginal, fOriginal)
            const aPatched = await split(sPatched, fOriginal)

            if (aOriginal.length !== aPatched.length) {
                Logger.error("Spritesheets don't match")
                return -1
            }

            let different = 0
            for (let i = 0; i < aOriginal.length; i++) {
                const iOriginal = aOriginal[i]
                const iPatched = aPatched[i]

                if (diff(iOriginal.split, iPatched.split) < 0.01) continue

                const p = join(target, f)
                if (aOriginal.length === 1) {
                    await ensureDir(join(p))

                    await iOriginal.split.writeAsync(join(p, "original.png"))
                    await iPatched.split.writeAsync(join(p, "patched.png"))

                    Logger.log(`Converted ${f} in ${Date.now() - startTime}ms`)
                    return 1
                }

                await ensureDir(join(p, "original"))
                await ensureDir(join(p, "patched"))

                await iOriginal.split.writeAsync(join(p, "original", `${basename(f).replace(/\.png$/, "")}_${(i + 1).toString().padStart(3, "0")}.png`))
                await iPatched.split.writeAsync(join(p, "patched", `${basename(f).replace(/\.png$/, "")}_${(i + 1).toString().padStart(3, "0")}.png`))
                different++
            }
            Logger.log(`Converted ${f} in ${Date.now() - startTime}ms`)
            if (different == 0)
                Logger.error(`Warning: ${f} is same as source!`)
            return different
        }
    )

    const changed = results.filter(k => k > 0).length,
          totalChanged = results.filter(k => k > 0).reduce((a, b) => a + b, 0),
          same = results.filter(k => k == 0).length,
          error = results.filter(k => k < 0).length
    Logger.log(`Finished converting in ${Date.now() - start}ms. Failed ${error} files, ${same} are same as original, ${changed} files converted resulting in ${totalChanged} diff files`)
}

async function getFiles(dir, queue = [], path = []) {
    await Promise.all((await readdir(dir)).map(async f => {
        const filePath = join(dir, f)
        const stats = await stat(filePath)

        if (stats.isDirectory())
            await getFiles(filePath, queue, [...path, f])
        else if (stats.isFile())
            queue.push([...path, f].join("/"))
    }))
    return queue
}


module.exports = { split, extractSplit, importExternalMod, outlines }
