@echo off

echo:
echo Preparing
rmdir /S /Q out
mkdir out\KCCacheProxy
rmdir /S /Q cache_template
mkdir cache_template

echo:
echo Updating cache_template cache
cd cache_template
node ..\src\proxy\preload
cd ..

echo:
echo Compiling old js version
call pkg --out-path out src\proxy\proxy.js

echo:
echo Copying some common files to out path
xcopy /E /H cache_template\* out\KCCacheProxy\

cd out

echo:
echo Making linux package
xcopy /E /H KCCacheProxy\ KCCacheProxy-linux\ && ^
move proxy-linux KCCacheProxy-linux\proxy-linux && ^
7z a KCCacheProxy-linux.zip KCCacheProxy-linux && ^
rmdir /S /Q KCCacheProxy-linux

echo:
echo Making macos package
xcopy /E /H KCCacheProxy\ KCCacheProxy-macos\ && ^
move proxy-macos KCCacheProxy-macos\proxy-macos && ^
7z a KCCacheProxy-macos.zip KCCacheProxy-macos && ^
rmdir /S /Q KCCacheProxy-macos

echo:
echo Making windows package
xcopy /E /H KCCacheProxy\ KCCacheProxy-win\ && ^
move proxy-win.exe KCCacheProxy-win\proxy-win.exe && ^
7z a KCCacheProxy-win.zip KCCacheProxy-win && ^
rmdir /S /Q KCCacheProxy-win

echo:
echo Making minimum cache package
xcopy /E /H KCCacheProxy\cache\ minimum-cache\ && ^
7z a minimum-cache.zip minimum-cache && ^
rmdir /S /Q minimum-cache
copy minimum-cache.zip ..\minimum-cache.zip

echo:
echo Making x64 build
call npm run-script make -- --arch x64

echo:
echo Making ia32 build
call npm run-script make -- --arch ia32

::for i in ./make/squirrel.windows/*/*.exe ; do 
    ::p="${i/.\/make\/squirrel.windows\//}"
    ::arch="${p/\/KC*/}"
    ::file=${p/\.exe/}
    ::cp "${i}" "./${file/*\//}-${arch}.exe" 
::done

echo:
echo Cleaning up
::for /d %%G in ("KCCacheProxy*") do echo ^> %%G && rmdir /S /Q %%G
::rmdir /S /Q make
cd ..