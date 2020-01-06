KanColle Cache Proxy
=======
This is a WIP proxy meant to cache local KC assets.

Installation
======
0. This bot requires [Node](https://nodejs.org/en/)
1. Install dependencies with `npm i`
2. You can start the proxy server with `npm start`. Optionally you can preload assets at this point, see "Preloading" for more information. 
3. To use this in your browser, an extension like [Proxy SwitchyOmega](https://chrome.google.com/webstore/detail/proxy-switchyomega/padekgcemlokbadohgkifijomclgjgif)
4. Add a new profile, set the HTTP proxy server to `localhost` and port to `8081`

![preview](https://i.imgur.com/w6wHZeM.png)
5. In autoswitch, add two URL wildcard conditions that point to the profile created in the previous step. In the first condition put `http://<your kc server ip>/kcs/*` and in the second `http://<your kc server ip>/kcs2/*`. You can find your KC server ip in the network tab of devtools when playing the game, or checking the output of the preloader.

![preview](https://i.imgur.com/cwBrda5.png)
6. Save your changes and enable the `Auto Switch` profile.

![preview](https://i.imgur.com/Z32Ga5J.png)

Don't forget to start the proxy server each time you want to use it.

**NOTE**: You can **NOT** run both the preloader and proxy server at the same time.

Preloading
======
You can preload most assets by using the preloader. This might take a while. 

You can enable/disable certain sections by editing `config.json`. By default, only the recommended ones are enabled. If you have sound enabled, it's recommended to enable BGM, SE and titlecalls. Enabling the extras will take a long time to finish (especially the ships one).

You can start the preloader by running `node preload`. Then, select your server by entering the letter before your server name. 