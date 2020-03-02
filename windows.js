if (process.platform !== "win32")
    return
    
const { startInBackground } = require("./config.json")

const { NotifyIcon, Icon, Menu } = require("not-the-systray");

const win32 = require("win32-api")
const { Kernel32, User32, ShowWindowArgs } = win32
const knl32 = Kernel32.load()
const user32 = User32.load()

const ref = require("ref-napi")

const lpszWnd = Buffer.from("KCCacheProxy Console\0", "ucs2")
const hWnd = user32.FindWindowExW(0, 0, null, lpszWnd)
var hWndOk = typeof hWnd === 'number' && hWnd > 0
  || typeof hWnd === 'bigint' && hWnd > 0
  || typeof hWnd === 'string' && hWnd.length > 0;
if (!hWndOk) {
    console.error("Could not retrieve console window handle.")    
}

var lastClickTime = 0
const appIcon = new NotifyIcon({
    icon: Icon.load("icon.ico", Icon.small),
    tooltip: "KCCacheProxy",
    onSelect({ target, rightButton, mouseX, mouseY }) {
        // manual doubleclick check because this api is a little dumb like that
        if (!rightButton) {
            var now = new Date().getTime()
            if (now - lastClickTime < 400) {
                showWindow()
                lastClickTime = 0
            }
            lastClickTime = now
        }
        else {
            handleMenu(mouseX, mouseY);
        }
    }
})

// Remove the icon and return window to normal on exit/Ctrl-C
process.on("SIGINT", () => {
    appIcon.remove()
    showWindow(SW_SHOWNORMAL)
    process.exit()
})
process.on("exit", () => {
    appIcon.remove()
    showWindow(SW_SHOWNORMAL)
})

async function handleMenu(x, y) {
    const showId = 3
    const hideId = 2
    const exitId = 1
    var menuItems = []
    if (windowState === SW_HIDE) {
        menuItems.push({ id: showId, text: "Show" })
    }
    else {
        menuItems.push({ id: hideId, text: "Hide" })
    }
    menuItems.push({ id: exitId, text: "Exit" })
    const menu = new Menu(menuItems)
    const id = await menu.show(x, y)
    switch (id) {
        case null:
            break
        case showId:
            showWindow(SW_SHOWNORMAL)
            break;
        case hideId:
            showWindow(SW_HIDE)
            break;
        case exitId:
            process.exit()
            break
    }
}

const SW_HIDE = 0
const SW_SHOWNORMAL = 1
var windowState = SW_SHOWNORMAL;
function showWindow(state) {
    if (state === undefined)
        state = windowState === SW_SHOWNORMAL ? SW_HIDE : SW_SHOWNORMAL
    windowState = state
    user32.ShowWindow(hWnd, state)
}

if (startInBackground) {
    showWindow(SW_HIDE)
}

// Show startup notification
appIcon.update({
    notification: {
        title: "KCCacheProxy running",
        text: "Use system tray icon to exit",
    },
})