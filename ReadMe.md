KanColle Cache Proxy
=======
This is a local proxy meant to cache KC assets. It can be preloaded from a cache dump (linked below). This will improve loading of assets on top of browser built-in cache.

Installation
======
0. This bot requires [Node](https://nodejs.org/en/), and optionally git to clone this repository (or download zip at top right, unzip it somewhere).
1. Install dependencies with npm by running `npm i` in the folder with `package.json`. Optionally you can preload assets at this point or use a cache dump, see "Preloading" for more information.
2. You can start the proxy server with `node proxy`. (Cannot be run while preloading)
3. Depending on browser/viewer used, set it up to use `localhost:8081` as HTTP proxy. Below are details on how to set up in Chrome with extra safety that it doesn't redirect game api requests through the proxy.

Don't forget to start the proxy server each time you want to use it.

**NOTE**: You can **NOT** run both the preloader and proxy server at the same time.

## Chrome proxy setup
1. To use this in chrome, an extension like [Proxy SwitchyOmega](https://chrome.google.com/webstore/detail/proxy-switchyomega/padekgcemlokbadohgkifijomclgjgif)
2. Add a new profile, set the HTTP proxy server to `localhost` and port to `8081` (this can be changed in the `config.json`). [Preview](https://i.imgur.com/w6wHZeM.png).
3. In autoswitch, add two URL wildcard conditions that point to the profile created in the previous step. In the first condition put `http://<your kc server ip>/kcs/*` and in the second `http://<your kc server ip>/kcs2/*`. You can find your KC server ip in the network tab of devtools when playing the game, or checking the output of the preloader. [Preview](https://i.imgur.com/cwBrda5.png)
4. Save your changes and enable the `Auto Switch` profile. [Preview](https://i.imgur.com/Z32Ga5J.png)

## Auto start on system startup (Windows)
1. Open the your startup folder by opening run (windows key + R) and running `shell:startup`
2. Drag and drop the `start.bat` file while holding down alt while releasing, this will create a shortcut.
3. The proxy can be shut down by pressing control+c, you can close the proxy created in "Installation" step 2 in this way. You can start it up again by double clicking the shortcut you just created.

Preloading
======
You can preload most assets by using the preloader. This might take a while to run. 

It's recommended that you start out from a cache dump. These also contains files which the preloader won't download. You can download the latest one (made on 2020-01-14 (Setsubun/Yuubari Kai Ni)) from [MEGA](https://mega.nz/#!pKZVmQpa!EiSElmwTvCobOOeIYlK4KMdJaH1Ej7Ry7UVxBoPjLws). Extract the zip so you'll have a folder `cache` with `cached.json` in it respectivelly to where you unzipped/cloned the repository (if there's a file `./proxy.js` then there should be `./cache/cached.json`)

You can enable/disable certain sections by editing `config.json`. By default, only the recommended ones are enabled. If you have sound enabled, it's recommended to enable BGM, SE and titlecalls. Enabling the extras will take a long time to finish (especially the ships one since it also does abyssals and old seasonals in `Assets` menu).

You can start the preloader by running `node preload`. Then, select your server by entering the letter before your server name. 
