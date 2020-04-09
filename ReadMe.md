KanColle Cache Proxy
=======
This is a local proxy meant to cache KC assets. It can be preloaded from a cache dump (linked below). This will improve loading of assets on top of browser built-in cache.

## Setup
It's recommended that you start out from a cache dump. You can download the latest one from [MEGA](https://mega.nz/#F!sOwClABa!yHldyYZr2MBqhTNYEupztg) (should be a bit over ~4GB). If you just want the minimal files required for the gadget server block since 2020-02-25, they are included in the new versions of the proxy.

### Setup for Windows (with UI)
0. Go to [Releases](https://github.com/Tibowl/KCCacheProxy/releases) and download the Setup.exe
1. Run this file, this will set up automatic startup on windows and some icons.
2. Optionally, you can import the minimal cache required to bypass from the UI. You can also change the location to store cache. If you changed the cache folder, you can reload the cached files with the `Reload cache` button.
3. Depending on browser/viewer used, set it up to use `localhost:8081` as HTTP proxy. [Below are some details](#browserviewer-setup)) on how to do it for some viewers/chrome.

#### Upgrading from v1
Install like above. Then in the UI you can set the cache location. You can move this folder wherever you want now. Clicking on save will load the cache at that location (if there is one). If you set up auto startup for the old version, please remove these.

### Setup using other compiled versions (legacy)
0. Go to [Releases](https://github.com/Tibowl/KCCacheProxy/releases) and download the zip for your platform
1. Unzip this file somewhere, run the executable. Recommended to do this from command prompt/powershell/terminal so the output is visible after it finishes running.
2. (Optional) Extract the downloaded cache dump, so you'll have a folder `cache` with `cached.json` in it respectively to where you unzipped/cloned the repository (if there's a file `./proxy.js` then there should be `./cache/cached.json`).
3. Depending on browser/viewer used, set it up to use `localhost:8081` as HTTP proxy. [Below are some details](#browserviewer-setup)) on how to do it for some viewers/chrome.

### Setup using node (legacy)
0. This proxy requires [Node](https://nodejs.org/en/), and optionally git to clone this repository (or download zip at top right, unzip it somewhere).
1. Install dependencies with npm by running `npm i --only=production` in the folder with `package.json`.
2. (Optional) Extract the downloaded cache dump, so you'll have a folder `cache` with `cached.json` in it respectively to where you unzipped/cloned the repository (if there's a file `./proxy.js` then there should be `./cache/cached.json`).
3. You can start the proxy server with `node proxy`.
4. Depending on browser/viewer used, set it up to use `localhost:8081` as HTTP proxy. [Below are some details](#browserviewer-setup)) on how to do it for some viewers/chrome.

**NOTE** for technical people: You can **NOT** run both the preloader and proxy server at the same time, unless you run the preloader via the proxy on startup.

## Updating
### Game/Cache
Game files should be automatically updated on the fly. No need to redownload a cache dump. Unless you need to update the IP block bypass, you can choose to either connect once with VPN, or replace some files from the minimum cache dump available in the [GitHub releases](https://github.com/Tibowl/KCCacheProxy/releases). Note: do **NOT** replace cached.json with the one from minimum cache! Doing so will make the proxy forget about all other cached files.

### Proxy
If you want to update the proxy, just re-run the Setup. If you're running node version and installed via git, run `git pull` and restart proxy. Otherwise unzip and restart proxy.

## Browser/Viewer setup

Below are some instructions for some viewers/browsers available
- [Chrome](#chrome-proxy-setup)
- [Electronic Observer](#electronic-observer)
- [Poi](#poi)

### Chrome proxy setup
[With pictures](https://github.com/planetarian/KCDocumentation/blob/master/KCCacheProxy.md#enabling-proxy-for-chromekc3)

1. To use this in chrome, an extension like [Proxy SwitchyOmega](https://chrome.google.com/webstore/detail/proxy-switchyomega/padekgcemlokbadohgkifijomclgjgif)
2. Import some settings by:
    1. Open options of said extension (from drop down menu)
    2. Go to `Import/Export`
    3. Enter `https://raw.githubusercontent.com/Tibowl/KCCacheProxy/master/misc/OmegaOptions.bak` in `Restore from online`
    4. Click on `Restore`. [Preview](https://i.imgur.com/LkFFooX.png)
3. Close the options tab and enable the `Auto Switch` profile in the dropdown menu. [Preview](https://i.imgur.com/Z32Ga5J.png)

### Electronic Observer
1. Open settings via File -> Settings.
2. Go to Network tab (should be first tab) and check `Use local proxy` and enter port `8081` (this can be changed in the `config.json` or the UI). [Preview](https://i.imgur.com/MplOchT.png)
3. Save and restart EO to apply your settings. [Preview](https://i.imgur.com/Fa7uyVJ.png)

### Poi
1. Open settings via the gear icon
2. Go to Network tab (should be fourth tab) set proxy to `HTTP Proxy` and change port to `8081` (this can be changed in the `config.json` or the UI). [Preview](https://i.imgur.com/jwOI0F4.png)
3. No refresh required, but it should help checking if it works by looking at the console window. [Preview](https://i.imgur.com/8HLMkB6.png)
