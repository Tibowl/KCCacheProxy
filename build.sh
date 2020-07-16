echo 'Clean previous output'
rm -r out/

echo 'Create folder in out path'
mkdir -p out/KCCacheProxy/

echo 'Update cache_template cache'
cd cache_template
node ../src/proxy/preload
cd ..

echo 'Compile old js version'
pkg --out-path out src/proxy/proxy.js

echo 'Copy some common files to out path'
cp -r cache_template/* out/KCCacheProxy/

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

cp minimum-cache.zip ../minimum-cache.zip

echo 'Make x64 & ia32 electron build'
npm run-script make -- --arch x64
npm run-script make -- --arch ia32

for i in ./make/squirrel.windows/*/*.exe ; do 
    p="${i/.\/make\/squirrel.windows\//}"
    arch="${p/\/KC*/}"
    file=${p/\.exe/}
    cp "${i}" "./${file/*\//}-${arch}.exe" 
done

echo 'Cleanup...'
rm -r KCCacheProxy*/
rm -r make