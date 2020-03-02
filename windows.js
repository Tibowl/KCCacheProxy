if (process.platform !== "win32")
    return
    
const { readFileSync } = require("fs-extra")
const { startInBackground } = JSON.parse(readFileSync("./config.json"))

const { NotifyIcon, Icon, Menu } = require("not-the-systray");

const { User32 } = require("win32-api")
const user32 = User32.load()

// Will break if there are two windows with the same title
const lpszWnd = Buffer.from("KCCacheProxy Console\0", "ucs2")
const hWnd = user32.FindWindowExW(0, 0, null, lpszWnd)
var hWndOk = typeof hWnd === 'number' && hWnd > 0
  || typeof hWnd === 'bigint' && hWnd > 0
  || typeof hWnd === 'string' && hWnd.length > 0;
if (!hWndOk) {
    console.error("Could not retrieve console window handle.")    
}

// System tray icon
var lastClickTime = 0
const appIcon = new NotifyIcon({
    icon: Icon.load("icon.ico", Icon.large),
    tooltip: "KCCacheProxy",
    onSelect({ target, rightButton, mouseX, mouseY }) {
        if (rightButton) {
            handleMenu(mouseX, mouseY);
        }
        else {
            // Manual doubleclick check because this API is a little basic
            var now = new Date().getTime()
            if (now - lastClickTime < 400) {
                showWindow() // No parameter toggles between shown/hidden
                lastClickTime = 0
            }
            else {
                lastClickTime = now
            }
        }
    }
})

// Remove the icon and return window to normal when closing
process.on("SIGINT", () => { // Ctrl-C
    appIcon.remove()
    showWindow(SW_SHOWNORMAL)
    process.exit()
})
process.on("exit", () => { // process.exit, etc.
    appIcon.remove()
    showWindow(SW_SHOWNORMAL)
})

async function handleMenu(x, y) {
    const showId = 3
    const hideId = 2
    const exitId = 1
    var menuItems = []
    // Only show the appropriate menu option.
    // Alternatively, change to a single 'Show/hide' and use ShowWindow()
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
    // If no state was provided, just toggle the current state
    if (state === undefined)
        state = windowState === SW_SHOWNORMAL ? SW_HIDE : SW_SHOWNORMAL
    windowState = state
    user32.ShowWindow(hWnd, state)
}

// Hide the window on startup based on config.json
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