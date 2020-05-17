const configure = require("@jimp/custom")

const png = require("@jimp/png")

const crop = require("@jimp/plugin-crop")
const mask = require("@jimp/plugin-mask")

module.exports = configure({
    types: [png],
    plugins: [mask, crop]
})
