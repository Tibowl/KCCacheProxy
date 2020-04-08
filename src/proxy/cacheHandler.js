const { mapLimit } = require("async")
const { readFile, exists, unlink, copyFile, ensureDir } = require("fs-extra")
const { join, dirname } = require("path")

module.exports = { verifyCache, mergeCache }

const { getConfig, getCacheLocation } = require("./config")
const Logger = require("./ipc")
const cacher = require("./cacher")

/**
 * Verifies cache, will delete if "delete" in argv or parameter set
 *
 * @param {boolean} [deleteinvalid] Delete invalid files
 */
async function verifyCache(deleteinvalid = process.argv.find(k => k.toLowerCase() == "delete")) {
    if(!getConfig().verifyCache) {
        Logger.error("verifyCache is not set in config! Aborted check!")
        return
    }

    Logger.log("Verifying cache... This might take a while")

    const responses = await mapLimit(
        Object.entries(cacher.getCached()),
        32,
        async ([key, value]) =>  {
            try {
                if(value.length == undefined) return 0
                const file = join(getCacheLocation(), key)
                const contents = await readFile(file)

                if(contents.length != value.length) {
                    Logger.error(key, "length doesn't match!", contents.length, value.length)
                    if(deleteinvalid)
                        unlink(file)
                    return 0
                }
                return 1
            } catch(e) {
                return -1
            }
        }
    )

    const total = responses.length,
          invalid = responses.filter(k => k == 0).length,
          checked = responses.filter(k => k >= 0).length,
          error   = responses.filter(k => k == -1).length

    Logger.log(`Done verifying, found ${invalid} invalid files, ${checked} files checked, cached.json contains ${total} files, failed to check ${error} files (missing?)`)
}

/**
 * Merges specified folder in current cache
 * @param {string} source Folder to merge from
 */
async function mergeCache(source) {
    const newCachedFile = join(source, "cached.json")
    if(!(await exists(newCachedFile)))
        return Logger.error("Missing cache details")

    const newCached = JSON.parse(await readFile(newCachedFile))

    let skipped = 0, copied = 0
    for(const file of Object.keys(newCached)) {
        const newFile = newCached[file]
        if (cacher.getCached()[file]) {
            const oldFile = cacher.getCached()[file]
            if (new Date(oldFile.lastmodified) > new Date(newFile.lastmodified)) {
                skipped++
                continue
            }
        }

        const targetLocation = join(getCacheLocation(), file)
        const sourceLocation = join(source, file)

        if(!(await exists(sourceLocation))) {
            Logger.error(`File ${file} missing in source`)
            continue
        }

        if(await exists(targetLocation))
            await unlink(targetLocation)

        await ensureDir(dirname(targetLocation))
        await copyFile(sourceLocation, targetLocation)
        cacher.getCached()[file] = newCached[file]
        copied++
    }
    await cacher.forceSave()

    Logger.log(`Finished merging cache! Skipped ${skipped} files. Copied ${copied}`)
}
