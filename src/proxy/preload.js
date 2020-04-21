const { eachLimit } = require("async")
const fetch = require("node-fetch")
const { readdirSync, readFileSync, removeSync } = require("fs-extra")
const { join } = require("path")

const cacher = require("./cacher")
const Logger = require("./ipc")
const { getConfig, getCacheLocation, preloader } = require("./config")
preloader()

const GADGET = "http://203.104.209.7/"
const INCLUDE_RARE = false

const SPECIAL_CG = [541, 571, 573, 576, 601, 1496]

let SERVER = ""
let GAME_VERSION = ""
let VERSIONS = {}
let START2 = {}

const run = async () => {
    if(cacher.getCached() == undefined)
        cacher.loadCached()

    // Recommended one-time
    if(getConfig().preloader.recommended.gadget)
        await cacheGadget()

    if(!getConfig().serverIP) return

    const kcs_const = readFileSync(join(getCacheLocation(), "/gadget_html5/js/kcs_const.js")).toString() //*/ await (await fetch(`${GADGET}gadget_html5/js/kcs_const.js`)).text()
    SERVER = `http://${getConfig().serverIP}/` //kcs_const.split("\n").find(k => k.includes(`ConstServerInfo.World_${serverID} `)).match(/".*"/)[0].replace(/"/g, "")
    GAME_VERSION = kcs_const.split("\n").find(k => k.includes("VersionInfo.scriptVesion ")).match(/".*"/)[0].replace(/"/g, "")

    Logger.log("Game version: " + GAME_VERSION)
    Logger.log(`Server IP: ${SERVER.split("/")[2]}`)
    Logger.log("Loading api_start2...")
    START2 = await (await fetch("https://raw.githubusercontent.com/Tibowl/api_start2/master/start2.json")).json()

    // SERVER = GADGET
    // await cacheURLs(Object.entries(require(join(getCacheLocation(), "/cached.json"))).filter(k => (k[0].includes("kcscontents") || k[0].includes("gadget_html5"))).map(k => k[0].substring(1) + k[1].version))

    await cacheURLs([
        `kcs2/version.json?${GAME_VERSION}`,
        `kcs2/js/main.js?version=${GAME_VERSION}`
    ])
    VERSIONS = JSON.parse(readFileSync(join(getCacheLocation(), "/kcs2/version.json")))

    // Recommendend to keep
    if(getConfig().preloader.recommended.static)
        await cacheStatic()
    if(getConfig().preloader.recommended.assets)
        await cacheAssets()
    if(getConfig().preloader.recommended.maps)
        await cacheMaps()
    if(getConfig().preloader.recommended.useitem)
        await cacheUseItem()
    if(getConfig().preloader.recommended.static)
        await cacheServerName()

    // For less loading
    if(getConfig().preloader.extra.equips)
        await cacheEquips()
    if(getConfig().preloader.extra.ships)
        await cacheShips()
    if(getConfig().preloader.extra.furniture)
        await cacheFurniture()

    // When game not muted
    if(getConfig().preloader.sounds.titlecalls)
        await cacheTitleCalls()
    if(getConfig().preloader.sounds.bgm)
        await cacheBGM()
    if(getConfig().preloader.sounds.se)
        await cacheSE()
    if(getConfig().preloader.sounds.npcvoices)
        await cacheNPCVoices()
    if(getConfig().preloader.sounds.voices)
        await cacheVoices()

    // Does not cache:
    // event_maesetsu: too hard to get keys easily
    // gauges beyond first one
    // purchase_items
    // other assets with as "key" START_TIME

    if(getConfig().preloader.cleanup)
        await cleanup()

    cacher.forceSave()
}

const cacheURLs = async (urls) => {
    await eachLimit(urls, getConfig().preloader.maxSimulPreload || 8, async (url) => {
        const full = SERVER + url
        // Logger.log(full)
        await cacher.handleCaching({
            url: full,
            headers: {
                host: SERVER.split("/")[2]
            },
            end: () => 0
        }, undefined)
    })
}

const cacheGadget = async () => {
    const urls = []

    // Important files
    for(const js of ["cda", "const", "content", "global", "inspection", "login", "options", "payment"])
        urls.push(`gadget_html5/js/kcs_${js}.js`)

    for(const script of ["cookie", "jquery.min", "jss", "rollover"])
        urls.push(`gadget_html5/script/${script}.js`)

    if(INCLUDE_RARE) {
        for (let i = 1; i <= 9; i++)
            urls.push(`kcscontents/dictionary/01_aa/d${(i+"").padStart(2, "0")}.html`)
        for (let i = 1; i <= 46; i++)
            urls.push(`kcscontents/dictionary/02_ka/d${(i+"").padStart(2, "0")}.html`)
        for (let i = 1; i <= 34; i++)
            urls.push(`kcscontents/dictionary/03_sa/d${(i+"").padStart(2, "0")}.html`)
        for (let i = 1; i <= 25; i++)
            urls.push(`kcscontents/dictionary/04_ta/d${(i+"").padStart(2, "0")}.html`)
        for (let i = 1; i <= 10; i++)
            urls.push(`kcscontents/dictionary/05_na/d${(i+"").padStart(2, "0")}.html`)
        for (let i = 1; i <= 13; i++)
            urls.push(`kcscontents/dictionary/06_ha/d${(i+"").padStart(2, "0")}.html`)
        for (let i = 1; i <= 2; i++)
            urls.push(`kcscontents/dictionary/07_ma/d${(i+"").padStart(2, "0")}.html`)
        for (let i = 1; i <= 3; i++)
            urls.push(`kcscontents/dictionary/08_ya/d${(i+"").padStart(2, "0")}.html`)
        for (let i = 1; i <= 13; i++)
            urls.push(`kcscontents/dictionary/09_ra/d${(i+"").padStart(2, "0")}.html`)

        for (let i = 1; i <= 20; i++) {
            urls.push(`kcs2/resources/worldselect/btn_chinjyufu${i}.png`)
            urls.push(`kcs2/resources/worldselect/btn_chinjyufu${i}_off.png`)
        }

        for (let y = 13; y <= 20; y++)
            for (let m = 1; m <= 12; m++)
                for (let i = 1; i <= 21; i++)
                    if(!(y == 13 && m < 6))
                        urls.push(`kcscontents/information/image/rank${(y+"").padStart(2, "0")}${(m+"").padStart(2, "0")}${(i+"").padStart(2, "0")}.jpg`)
    }
    Logger.log(`Caching ${urls.length} gadget urls`)

    await eachLimit(urls, getConfig().preloader.maxSimulPreload || 8, async (url) => {
        const full = GADGET + url
        Logger.log(full)
        await cacher.handleCaching({
            url: full,
            headers: {
                host: GADGET.split("/")[2]
            },
            end: () => 0
        }, undefined)
    })
}

const cacheStatic = async () => {
    const urls = require("./preloader/urls.json")

    if(INCLUDE_RARE)
        for(let i = 0; i < 50; i++) {
            urls.push(`kcs2/resources/stype/etext/${(i+"").padStart(3, "0")}.png`)
            urls.push(`kcs2/resources/stype/etext/sp${(i+"").padStart(3, "0")}.png`)
            urls.push(`kcs2/resources/area/airunit/${(i+"").padStart(3, "0")}.png`)
            urls.push(`kcs2/resources/area/airunit_extend_confirm/${(i+"").padStart(3, "0")}_.png`)
            urls.push(`kcs2/resources/area/airunit_extend_confirm/${(i+"").padStart(3, "0")}.png`)
            urls.push(`kcs2/resources/area/sally/${(i+"").padStart(3, "0")}.png`)
        }

    Logger.log(`Caching ${urls.length} URLs`)
    await cacheURLs(urls)
}

const cacheAssets = async () => {
    const assets = require("./preloader/assets.json")
    for(const type of Object.keys(assets)) {
        const urls = assets[type].map(k => `kcs2/img/${type}/${k}?version=${VERSIONS[type]}`)
        Logger.log(`Caching ${urls.length} of assets type ${type}`)
        await cacheURLs(urls)
    }

    const urls = [
        `kcs2/img/common/bg_map/bg_h.png${VERSIONS.map ? `?version=${VERSIONS.map}`:""}`,
        `kcs2/img/common/bg_map/bg_y.png${VERSIONS.map ? `?version=${VERSIONS.map}`:""}`
    ]
    await cacheURLs(urls)
}

const cacheTitleCalls = async () => {
    // kcs2/resources/voice/titlecall_1/019.mp3
    const urls = []
    for(let i = 1; i <= 86; i++)
        urls.push(`kcs2/resources/voice/titlecall_1/${(i+"").padStart(3, "0")}.mp3`)
    for(let i = 1; i <= 49; i++)
        urls.push(`kcs2/resources/voice/titlecall_2/${(i+"").padStart(3, "0")}.mp3`)

    Logger.log(`Caching ${urls.length} title calls`)
    await cacheURLs(urls)
}

const cacheSE = async () => {
    const urls = []
    const missing = [119, 232, 233, 234, 236, 251, 259, 260, 261, 262, 263]
    for(let i = 101; i <= 120; i++)
        if(!missing.includes(i))
            urls.push(`kcs2/resources/se/${i}.mp3`)
    for(let i = 201; i <= 264; i++)
        if(!missing.includes(i))
            urls.push(`kcs2/resources/se/${i}.mp3`)
    for(let i = 301; i <= 327; i++)
        urls.push(`kcs2/resources/se/${i}.mp3`)

    Logger.log(`Caching ${urls.length} SE`)
    await cacheURLs(urls)
}

const cacheMaps = async () => {
    let urls = []

    const getVersion = (map) => {
        if(VERSIONS.resources && VERSIONS.resources.map && VERSIONS.resources.map[map])
            return `?version=${VERSIONS.resources.map[map]}`
        return ""
    }
    for (const map of START2.api_mst_mapinfo) {
        const {api_maparea_id, api_no} = map
        urls.push(
            `kcs2/resources/map/${(""+api_maparea_id).padStart(3, "0")}/${(""+api_no).padStart(2, "0")}.png${getVersion(api_maparea_id*10+api_no)}`,
            `kcs2/resources/map/${(""+api_maparea_id).padStart(3, "0")}/${(""+api_no).padStart(2, "0")}_info.json${getVersion(api_maparea_id*10+api_no)}`,
            `kcs2/resources/map/${(""+api_maparea_id).padStart(3, "0")}/${(""+api_no).padStart(2, "0")}_image.json${getVersion(api_maparea_id*10+api_no)}`,
            `kcs2/resources/map/${(""+api_maparea_id).padStart(3, "0")}/${(""+api_no).padStart(2, "0")}_image.png${getVersion(api_maparea_id*10+api_no)}`
        )
        if(map.api_required_defeat_count != null || map.api_max_maphp != null)
            urls.push(`kcs2/resources/gauge/${(""+api_maparea_id).padStart(3, "0")}${(""+api_no).padStart(2, "0")}.json${getVersion(api_maparea_id*10+api_no)}`)
    }

    Logger.log(`Caching ${urls.length} map assets`)
    await cacheURLs(urls)
    urls = []

    for (const map of readdirSync(join(getCacheLocation(), "/kcs2/resources/gauge"))) {
        if(!map.endsWith(".json")) continue

        const gaugeFile = JSON.parse(readFileSync(join(getCacheLocation(), `/kcs2/resources/gauge/${map}`)))
        // TODO append version tag
        if(gaugeFile.img) {
            urls.push(`kcs2/resources/gauge/${gaugeFile.img}.png`)
            urls.push(`kcs2/resources/gauge/${gaugeFile.img}_light.png`)
        }
        if(gaugeFile.vertical && gaugeFile.vertical.img) {
            urls.push(`kcs2/resources/gauge/${gaugeFile.vertical.img}.png`)
            urls.push(`kcs2/resources/gauge/${gaugeFile.vertical.img}_light.png`)
        }
    }

    Logger.log(`Caching ${urls.length} map gauge assets`)
    await cacheURLs(urls)
}

const cacheShips = async () => {
    const urls = []
    for (const ship of START2.api_mst_shipgraph) {
        if(ship.api_sortno == 0 && ship.api_boko_d) continue
        // ship.api_boko_d exists for friendly
        // ship.api_sortno == 0 for unused friendly
        // ship.api_battle_n exists for friendly/abyssal, not old seasonal

        const { api_id, api_filename, api_version } = ship
        const version = api_version[0] != "1" ? "?version=" + api_version[0] : ""
        const types = [], typesKey = []
        const mst_ship = START2.api_mst_ship.find(k => k.api_id == api_id)
        if(!ship.api_battle_n) {
            // Seasonal
            if([5358, 5433, 5434].includes(api_id)) continue

            types.push("character_full", "character_up")
            if(INCLUDE_RARE)
                types.push("card", "character_full_dmg", "character_up_dmg")
        } else if(ship.api_boko_d && mst_ship && mst_ship.api_name != "") {
            // Friendly
            types.push(
                "card", "card_dmg",
                "banner", "banner_dmg", "banner_g_dmg",
                "banner2", "banner2_dmg", "banner2_g_dmg",
                "character_full", "character_full_dmg",
                "character_up", "character_up_dmg",
                "remodel", "remodel_dmg",
                "supply_character", "supply_character_dmg",
                "album_status"
            )
            typesKey.push("full", "full_dmg")
            if(SPECIAL_CG.includes(api_id))
                types.push("special")

            if (INCLUDE_RARE) {
                types.push(
                    "card_round", "icon_box",
                    "reward_card", "reward_icon",
                    "sp_remodel/text_remodel_mes", "sp_remodel/full_x2", "sp_remodel/text_class", "sp_remodel/text_name", "sp_remodel/silhouette",
                )
                urls.push(`kcs2/resources/ship/sp_remodel/animation_key/${api_id.toString().padStart(4, "0")}_remodel.json${version}`)
            }
        } else if(mst_ship && mst_ship.api_name != "") {
            // Abyssal
            types.push(
                "banner", "banner_g_dmg",
                "banner3", "banner3_g_dmg"
            )
            typesKey.push("full")

            if(INCLUDE_RARE) {
                types.push("banner_d", "banner_dmg")
                typesKey.push("full_dmg", "full_d", "full_d_dmg")
            }
        }

        types.forEach((type) => urls.push(getPath(api_id, "ship", type, "png") + version))
        typesKey.forEach((type) => urls.push(getPath(api_id, "ship", type, "png", api_filename) + version))
    }

    Logger.log(`Caching ${urls.length} ship assets`)
    await cacheURLs(urls)
}

const cacheEquips = async () => {
    const urls = []
    const typesNoKeyFriendly = [
        "card", "card_t",
        "item_character", "item_on", "item_up",
        "remodel",
        "statustop_item"
    ]
    const typesNoKeyAbyssal = []
    if(INCLUDE_RARE) {
        typesNoKeyFriendly.push("btxt_flat")
        typesNoKeyAbyssal.push("item_up", "btxt_flat")
    }

    for (const equip of START2.api_mst_slotitem) {
        const {api_id, api_version} = equip
        const version = api_version ? "?version=" + api_version : ""
        for(const type of api_id < 500 ? typesNoKeyFriendly : typesNoKeyAbyssal)
            if(!(api_id == 42 && type == "item_character"))
                urls.push(getPath(api_id, "slot", type, "png") + version)

        // Airplanes
        if(equip.api_type[4] != 0  && api_id < 500) {
            for(const type of ["airunit_fairy", "airunit_banner", "airunit_name"])
                urls.push(getPath(api_id, "slot", type, "png") + version)
        }
        if(api_id < 5 || (api_id > 10 && api_id < 38)) {
            urls.push(`kcs2/resources/plane/${(api_id+"").padStart(3, "0")}.png`)
            urls.push(`kcs2/resources/plane/r${(api_id+"").padStart(3, "0")}.png`)
        }
        if(api_id < 18)
            urls.push(`kcs2/resources/plane/e${(api_id+"").padStart(3, "0")}.png`)
    }

    Logger.log(`Caching ${urls.length} equip assets`)
    await cacheURLs(urls)
}

const cacheBGM = async () => {
    const urls = []
    let bgm = []

    // Battle BGMs
    const missing_battle = [24]
    for(let i = 1; i <= 151; i++)
        if(!missing_battle.includes(i))
            bgm.push(i)

    // In case there are still some missing (new events)
    for (const map of START2.api_mst_mapbgm) {
        const {api_boss_bgm, api_map_bgm, api_moving_bgm} = map

        if(!bgm.includes(api_moving_bgm))
            bgm.push(api_moving_bgm)

        if(!bgm.includes(api_map_bgm[0]))
            bgm.push(api_map_bgm[0])
        if(!bgm.includes(api_map_bgm[1]))
            bgm.push(api_map_bgm[1])

        if(!bgm.includes(api_boss_bgm[0]))
            bgm.push(api_boss_bgm[0])
        if(!bgm.includes(api_boss_bgm[1]))
            bgm.push(api_boss_bgm[1])
    }
    urls.push(...bgm.sort().map(id => getPath(id, "bgm", "battle", "mp3")))
    bgm = []

    // Port BGMs
    for(let i = 101; i <= 143; i++)
        bgm.push(i)
    for(let i = 201; i <= 249; i++)
        bgm.push(i)
    // Add missing ones
    for (const mst_bgm of START2.api_mst_bgm) {
        const {api_id} = mst_bgm

        if(!bgm.includes(api_id))
            bgm.push(api_id)
    }
    urls.push(...bgm.sort().map(id => getPath(id, "bgm", "port", "mp3")))

    // Fanfare BGMs
    urls.push(...[1, 2, 3, 4, 5].map(id => getPath(id, "bgm", "fanfare", "mp3")))

    Logger.log(`Caching ${urls.length} BGM assets`)
    await cacheURLs(urls)
}

const cacheFurniture = async () => {
    let urls = []
    for(let i = 0; i <= 8; i++)
        for(let j = 1; j <= 5; j++)
            urls.push(`kcs2/resources/furniture/outside/window_bg_${i}-${j}.png`)

    for (const mst_bgm of START2.api_mst_furniture) {
        const {api_id, api_active_flag, api_version} = mst_bgm
        const version = (api_version && api_version != "1") ? "?version=" + api_version : ""
        if(api_active_flag == 1) {
            urls.push(getPath(api_id, "furniture", "scripts", "json") + version)
            urls.push(getPath(api_id, "furniture", "movable", "json") + version)
            urls.push(getPath(api_id, "furniture", "movable", "png") + version)
            urls.push(getPath(api_id, "furniture", "thumbnail", "png") + version)
        } else if(![8, 32, 43, 62, 121, 131, 134, 150, 153, 163, 167, 169, 173, 177, 190, 191].includes(api_id)){
            urls.push(getPath(api_id, "furniture", "normal", "png") + version)
        }
        if(INCLUDE_RARE)
            urls.push(getPath(api_id, "furniture", "reward", "png") + version)
    }

    Logger.log(`Caching ${urls.length} furniture assets`)
    await cacheURLs(urls)
    urls = []

    for (const mst_bgm of START2.api_mst_furniture) {
        const {api_id, api_active_flag, api_version} = mst_bgm
        const version = (api_version && api_version != "1") ? "?version=" + api_version : ""
        if(api_active_flag != 1) continue
        const script = JSON.parse(readFileSync(join(getCacheLocation(), getPath(api_id, "furniture", "scripts", "json"))).toString().trim())

        const standard = script.standard
        if(!standard.hitarea) continue
        const action = standard.hitarea.state
        if(!action) continue
        if(!script[action]) continue
        if(!script[action].data) continue
        if(!Array.isArray(script[action].data)) continue
        for (const data of script[action].data) {
            if(!Array.isArray(data)) continue
            for (const action of data)
                if(action.popup && action.popup.src)
                    urls.push(getPath(+action.popup.src, "furniture", "picture", "png") + version)
        }
    }

    Logger.log(`Caching ${urls.length} furniture pictures`)
    await cacheURLs(urls)
}

const cacheServerName = async () => {
    Logger.log("Caching 3 server name assets")
    await cacheURLs([
        `kcs2/resources/world/${SERVER.split("/")[2].split(".").map(k => k.padStart(3, 0)).join("_")}_t.png`,
        `kcs2/resources/world/${SERVER.split("/")[2].split(".").map(k => k.padStart(3, 0)).join("_")}_s.png`,
        `kcs2/resources/world/${SERVER.split("/")[2].split(".").map(k => k.padStart(3, 0)).join("_")}_l.png`,
    ])
}

const cacheUseItem = async () => {
    const urls = []
    for (const useitem of START2.api_mst_useitem) {
        const {api_id, api_name} = useitem
        if(api_name == "") continue

        if(![2, 10, 31, 32, 33, 34, 44, 49, 50, 51, 53, 76].includes(api_id))
            urls.push(`kcs2/resources/useitem/card/${(api_id+"").padStart(3, "0")}.png`)

        if(api_id < 49 && api_id != 10)
            urls.push(`kcs2/resources/useitem/card_/${(api_id+"").padStart(3, "0")}.png`)
    }
    Logger.log(`Caching ${urls.length} use item assets`)
    await cacheURLs(urls)
}

const cacheNPCVoices = async () => {
    const urls = []

    const quotes = await (await fetch("https://raw.githubusercontent.com/KC3Kai/kc3-translations/master/data/en/quotes.json")).json()

    if(quotes && quotes.npc)
        urls.push(...Object.keys(quotes.npc).filter(k => quotes.npc[k] != "" && !k.includes("_old")).map(id => `kcs/sound/kc9999/${id}.mp3`))

    if(quotes && quotes.event)
        urls.push(...Object.keys(quotes.event).filter(k => quotes.event[k] != "" && !k.includes("_old")).map(id => `kcs/sound/kc9997/${id}.mp3`))

    if(quotes && quotes.abyssal)
        urls.push(...Object.keys(quotes.abyssal).filter(k => quotes.abyssal[k] != "" && !k.includes("_old")).map(id => `kcs/sound/kc9998/${id}.mp3`))

    Logger.log(`Caching ${urls.length} NPC/event/abyssal voice lines`)
    await cacheURLs(urls)
}

// https://github.com/KC3Kai/KC3Kai/blob/master/src/library/modules/Meta.js#L903
const workingDiffs = [
    2475, 6547, 1471, 8691, 7847, 3595, 1767, 3311, 2507,
    9651, 5321, 4473, 7117, 5947, 9489, 2669, 8741, 6149,
    1301, 7297, 2975, 6413, 8391, 9705, 2243, 2091, 4231,
    3107, 9499, 4205, 6013, 3393, 6401, 6985, 3683, 9447,
    3287, 5181, 7587, 9353, 2135, 4947, 5405, 5223, 9457,
    5767, 9265, 8191, 3927, 3061, 2805, 3273, 7331
]
const specialReairVoiceShips = [
    56, 160, 224, 65, 194, 268, 114, 200, 290, 123, 142,
    295, 126, 398, 127, 399, 135, 304, 136, 418, 496
]
const getFilenameByVoiceLine = (ship_id, lineNum) => {
    return lineNum <= 53 ? 100000 + 17 * (ship_id + 7) * (workingDiffs[lineNum - 1]) % 99173 : lineNum
}
const cacheVoices = async () => {
    const urls = []

    for (const ship of START2.api_mst_shipgraph) {
        if(ship.api_sortno == 0 || !ship.api_battle_n || !ship.api_boko_d) continue

        const {api_id, api_filename, api_version} = ship
        const mstship = START2.api_mst_ship.find(k => k.api_id == api_id)
        if(!mstship) continue

        const api_voicef = mstship.api_voicef || 0
        const getVersion = (id) => {
            const ind = (id == 2 || id == 3) ? 2 : 1
            return (api_version.length > ind && api_version[ind] != "1") ? "?version=" + api_version[ind] : ""
        }

        const vnums = [
            1, 25, 2, 3, 4, 28, 24, 8, 13, 9, 10, 26, 27, 11,
            12, 5, 7, 14, 15, 16, 18, 17, 23, 19, 20, 21, 22,
        ]

        if ((1 & api_voicef) !== 0)
            vnums.push(29)
        if ((4 & api_voicef) !== 0)
            vnums.push(129)
        if ((2 & api_voicef) !== 0)
            vnums.push(
                30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41,
                42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53
            )
        if(SPECIAL_CG.includes(api_id))
            vnums.push(900)//, 901, 902, 903)
        if([432, 353].includes(api_id))
            vnums.push(917, 918)
        if(specialReairVoiceShips.includes(api_id))
            vnums.push(6)

        // Friend fleet lines
        if(INCLUDE_RARE)
            vnums.push(...[141, 241, 142, 242, 342, 143, 243, 343, 144, 244, 344, 145, 245, 146, 246, 147, 247])

        urls.push(...vnums.map(id => `kcs/sound/kc${api_filename}/${getFilenameByVoiceLine(api_id, id)}.mp3${getVersion(id)}`))
    }

    Logger.log(`Caching ${urls.length} ship voice lines`)
    await cacheURLs(urls)
}

const cleanup = async () => {
    let cleared = {
        "sound": 0,
        "shipcg": 0
    }
    const del = (dir) => {
        Object.keys(cacher.getCached()).filter(k => k.startsWith(dir)).forEach(k => delete cacher.getCached()[k])
        removeSync(join(getCacheLocation(), dir))
        cacher.queueCacheSave()
    }

    for(const dir of readdirSync(join(getCacheLocation(), "/kcs/sound/"))) {
        if(!START2.api_mst_shipgraph.some(k => dir == `kc${k.api_filename}`)
            && !dir.startsWith("kc999")) {
            cleared.sound++
            del(`/kcs/sound/${dir}`)
        }
    }

    for(const file of readdirSync(join(getCacheLocation(), "/kcs2/resources/ship/full/"))) {
        if(!START2.api_mst_shipgraph.some(k => file.endsWith(`_${k.api_filename}.png`))) {
            cleared.shipcg++
            del(`/kcs2/resources/ship/full/${file}`)
        }
    }

    for(const file of readdirSync(join(getCacheLocation(), "/kcs2/resources/ship/full_dmg/"))) {
        if(!START2.api_mst_shipgraph.some(k => file.endsWith(`_${k.api_filename}.png`))) {
            cleared.shipcg++
            del(`/kcs2/resources/ship/full_dmg/${file}`)
        }
    }

    /*
    del("/kcs2/resources/ship/full_x2")
    del("/kcs2/resources/ship/text_class")
    del("/kcs2/resources/ship/text_name")
    del("/kcs2/resources/ship/text_remodel_mes")
    */

    Logger.log(`Cleaned ${cleared.sound} unused sound folders, ${cleared.shipcg} unused ship CGs`)
}

const resource = [6657, 5699, 3371, 8909, 7719, 6229, 5449, 8561, 2987, 5501, 3127, 9319, 4365, 9811, 9927, 2423, 3439, 1865, 5925, 4409, 5509, 1517, 9695, 9255, 5325, 3691, 5519, 6949, 5607, 9539, 4133, 7795, 5465, 2659, 6381, 6875, 4019, 9195, 5645, 2887, 1213, 1815, 8671, 3015, 3147, 2991, 7977, 7045, 1619, 7909, 4451, 6573, 4545, 8251, 5983, 2849, 7249, 7449, 9477, 5963, 2711, 9019, 7375, 2201, 5631, 4893, 7653, 3719, 8819, 5839, 1853, 9843, 9119, 7023, 5681, 2345, 9873, 6349, 9315, 3795, 9737, 4633, 4173, 7549, 7171, 6147, 4723, 5039, 2723, 7815, 6201, 5999, 5339, 4431, 2911, 4435, 3611, 4423, 9517, 3243]
const key = s => s.split("").reduce((a, e) => a + e.charCodeAt(0), 0)
const create = (id, type) =>
    (17 * (id + 7) * resource[(key(type) + id * type.length) % 100] % 8973 + 1000).toString()
const pad = (id, eors) => eors == "ship" ? id.toString().padStart(4, "0") : id.toString().padStart(3, "0")
const getPath = (id, eors, type, ext, filename) => {
    let suffix = ""
    if(type.indexOf("_d") > 0 && type.indexOf("_dmg") < 0) {
        suffix = "_d"
        type = type.replace("_d", "")
    }
    let uniqueKey = filename ? "_" + filename : ""

    return `kcs2/resources/${eors}/${type}/${pad(id, eors)}${suffix}_${create(id, `${eors}_${type}`)}${uniqueKey}.${ext}`
}
if (require.main === module)
    run()

module.exports = { run }
