/**
 * Gives ratio of different pixels, uses modified pixelmatch
 *
 * @see https://github.com/mapbox/pixelmatch
 * @see https://github.com/oliver-moran/jimp/blob/master/packages/core/src/index.js#L1025
 *
 * @param {import("@jimp/core").default} img1
 * @param {import("@jimp/core").default} img2
 * @param {number} [threshold] a number, 0 to 1, the smaller the value the more sensitive the comparison (default: 0.1)
 */
function diff(img1, img2, threshold = 0.1) {
    const bmp1 = img1.bitmap
    const bmp2 = img2.bitmap

    const numDiffPixels  = pixelmatch(
        bmp1.data,
        bmp2.data,
        bmp1.width,
        bmp1.height,
        { threshold }
    )

    return numDiffPixels / (img1.bitmap.width * img1.bitmap.height)
}

const defaultOptions = {
    threshold: 0.1,
}

function pixelmatch(img1, img2, width, height, options) {
    options = Object.assign({}, defaultOptions, options)

    const len = width * height
    const a32 = new Uint32Array(img1.buffer, img1.byteOffset, len)
    const b32 = new Uint32Array(img2.buffer, img2.byteOffset, len)
    let identical = true

    for (let i = 0; i < len; i++) {
        if (a32[i] !== b32[i]) { identical = false; break }
    }
    if (identical)
        return 0


    const maxDelta = 35215 * options.threshold * options.threshold
    let diff = 0

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const pos = (y * width + x) * 4
            const delta = colorDelta(img1, img2, pos, pos)
            if (Math.abs(delta) > maxDelta)
                diff++
        }
    }
    return diff
}
function colorDelta(img1, img2, k, m) {
    let r1 = img1[k + 0]
    let g1 = img1[k + 1]
    let b1 = img1[k + 2]
    let a1 = img1[k + 3]

    let r2 = img2[m + 0]
    let g2 = img2[m + 1]
    let b2 = img2[m + 2]
    let a2 = img2[m + 3]

    if (a1 === a2 && r1 === r2 && g1 === g2 && b1 === b2) return 0

    if (a1 < 255) {
        a1 /= 255
        r1 = blend(r1, a1, k)
        g1 = blend(g1, a1, k)
        b1 = blend(b1, a1, k)
    }

    if (a2 < 255) {
        a2 /= 255
        r2 = blend(r2, a2, m)
        g2 = blend(g2, a2, m)
        b2 = blend(b2, a2, m)
    }

    const y1 = rgb2y(r1, g1, b1)
    const y2 = rgb2y(r2, g2, b2)
    const y = y1 - y2

    const i = rgb2i(r1, g1, b1) - rgb2i(r2, g2, b2)
    const q = rgb2q(r1, g1, b1) - rgb2q(r2, g2, b2)

    const delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q

    return y1 > y2 ? -delta : delta
}

function rgb2y(r, g, b) { return r * 0.29889531 + g * 0.58662247 + b * 0.11448223 }
function rgb2i(r, g, b) { return r * 0.59597799 - g * 0.27417610 - b * 0.32180189 }
function rgb2q(r, g, b) { return r * 0.21147017 - g * 0.52261711 + b * 0.31114694 }

// blend semi-transparent color with white or black, alternating each pixel
function blend(c, a, p) {
    if (p % 2)
        return 255 + (c - 255) * a
    return c * a
}

module.exports = { diff }
