# Clean previous output
rm -r out/

# Compile js files
pkg --out-path out src/proxy/proxy.js

# Create folder in out path
mkdir -p out/KCCacheProxy/preloader

# Update cache_template cache
cd cache_template
node ../src/proxy/preload
cd ..

# Copy some common files to out path
cp -r cache_template/* out/KCCacheProxy/
cp preloader/* out/KCCacheProxy/preloader

cd out

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
mv proxy-win.exe KCCacheProxy-win/proxy-win.exe &&
7z a KCCacheProxy-win.zip KCCacheProxy-win &&
rm -r KCCacheProxy-win &

# Make minimum cache package
cp -r KCCacheProxy/cache/ minimum-cache/ &&
7z a minimum-cache.zip minimum-cache &&
rm -r minimum-cache &

wait
rm -r KCCacheProxy