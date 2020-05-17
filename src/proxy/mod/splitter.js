const Jimp = require("./jimp")
const { exists, readFile} = require("fs-extra")
const { basename, join } = require("path")

const Logger = require("./../ipc")

/**
 * @typedef {Object} Split
 * @property {import("jimp")} split
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
async function split(spritesheet, fileLocation) {
    const spritesheetMeta = fileLocation.replace(/\.png$/, ".json")
    if (!await exists(spritesheetMeta))
        return [spritesheet]

    try {
        const meta = JSON.parse(await readFile(spritesheetMeta))
        return Object.values(meta.frames).map(frame => {
            const {frame: {x, y, w ,h}} = frame
            const extracted = spritesheet.clone().crop(x, y, w, h)
            return {
                x, y, w ,h,
                split: extracted,
                // hash: extracted.pHash()
            }
        })
    } catch (error) {
        Logger.error(error)
        return [spritesheet]
    }
}

async function extractSplit(source, target) {
    const startTime = Date.now()
    const spritesheet = await Jimp.read(source)
    const splits = await split(spritesheet, source)
    await Promise.all(splits.map((j, i) => j.split.writeAsync(join(target, `${basename(source).replace(/\.png$/, "")}_${i+1}.png`))))
    Logger.log("Extracted in", Date.now() - startTime, "ms")
}

module.exports = { split, extractSplit }
