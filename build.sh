# Clean previous build
rm -r build/

# Compile js files
pkg --out-path build proxy.js

# Create folder in build path
mkdir -p build/KCCacheProxy/preloader

# Update build_template cache
cd build_template
node ../preload
cd ..

# Copy some common files to build path
cp -r build_template/* build/KCCacheProxy/
cp preloader/* build/KCCacheProxy/preloader

# Copy default config.json
mv config.json config.json.tmp
git checkout config.json
mv config.json build/KCCacheProxy/config.json
mv config.json.tmp config.json

cd build

# Make linux package
cp -r KCCacheProxy/ KCCacheProxy-linux/ && 
mv proxy-linux KCCacheProxy-linux/proxy-linux &&
7z a KCCacheProxy-linux.zip KCCacheProxy-linux &&
rm -r KCCacheProxy-linux &

# Make macos package
cp -r KCCacheProxy/ KCCacheProxy-macos/ &&
mv proxy-macos KCCacheProxy-macos/proxy-macos && 
7z a KCCacheProxy-macos.zip KCCacheProxy-macos &&
rm -r KCCacheProxy-macos &

# Make windows package
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

# Make minimum cache package
cp -r KCCacheProxy/cache/ minimum-cache/ &&
7z a minimum-cache.zip minimum-cache &&
rm -r minimum-cache &

wait
rm -r KCCacheProxy