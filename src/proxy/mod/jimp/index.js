const configure = require("@jimp/custom")

const png = require("@jimp/png")

const color = require("@jimp/plugin-color")
const crop = require("@jimp/plugin-crop")
const mask = require("@jimp/plugin-mask")
const resize = require("@jimp/plugin-resize")

module.exports = configure({
    types: [png],
    plugins: [resize, color, mask, crop]
})
