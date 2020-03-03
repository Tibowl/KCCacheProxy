rm -r build/

pkg --out-path build proxy.js

mkdir -p build/KCCacheProxy/preloader
cp -r build_template/* build/KCCacheProxy/

cp preloader/* build/KCCacheProxy/preloader

mv config.json config.json.tmp
git checkout config.json
mv config.json build/KCCacheProxy/config.json
mv config.json.tmp config.json

cd build

cp -r KCCacheProxy/ KCCacheProxy-linux/ && 
mv proxy-linux KCCacheProxy-linux/proxy-linux &&
7z a KCCacheProxy-linux.zip KCCacheProxy-linux &&
rm -r KCCacheProxy-linux &

cp -r KCCacheProxy/ KCCacheProxy-macos/ &&
mv proxy-macos KCCacheProxy-macos/proxy-macos && 
7z a KCCacheProxy-macos.zip KCCacheProxy-macos &&
rm -r KCCacheProxy-macos &

cp -r KCCacheProxy/ KCCacheProxy-win/ &&
mkdir -p ./KCCacheProxy-win/node_modules/not-the-systray &&
cp ../node_modules/not-the-systray/notify_icon.node ./KCCacheProxy-win/node_modules/not-the-systray/ &&
mkdir -p ./KCCacheProxy-win/node_modules/ref-napi/build/Release &&
cp ../node_modules/ref-napi/build/Release/binding.node ./KCCacheProxy-win/node_modules/ref-napi/build/Release/ &&
mkdir -p ./KCCacheProxy-win/node_modules/ffi-napi/build/Release &&
cp ../node_modules/ffi-napi/build/Release/ffi_bindings.node ./KCCacheProxy-win/node_modules/ffi-napi/build/Release/ &&
cp ../icon.ico ./KCCacheProxy-win/ &&
mv proxy-win.exe KCCacheProxy-win/proxy-win.exe &&
7z a KCCacheProxy-win.zip KCCacheProxy-win &&
rm -r KCCacheProxy-win &

wait
rm -r KCCacheProxy