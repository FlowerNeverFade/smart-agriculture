@echo off
setlocal EnableExtensions EnableDelayedExpansion
set VERSION=8.10.2
where gradle >nul 2>nul
if %ERRORLEVEL%==0 (
  gradle %*
  exit /b %ERRORLEVEL%
)
set CACHE=%USERPROFILE%\.gradle\agriloop-distributions
set DIST=%CACHE%\gradle-%VERSION%
if not exist "!DIST!\bin\gradle.bat" (
  if not exist "!CACHE!" mkdir "!CACHE!"
  set ZIP=!CACHE!\gradle-!VERSION!-bin.zip
  if not exist "!ZIP!" curl.exe -fL --retry 3 "https://mirrors.cloud.tencent.com/gradle/gradle-!VERSION!-bin.zip" -o "!ZIP!"
  if exist "!CACHE!\extract" rmdir /S /Q "!CACHE!\extract"
  mkdir "!CACHE!\extract"
  tar.exe -xf "!ZIP!" -C "!CACHE!\extract"
  move /Y "!CACHE!\extract\gradle-!VERSION!" "!DIST!" >nul
  rmdir /S /Q "!CACHE!\extract" 2>nul
)
call "!DIST!\bin\gradle.bat" --no-daemon %*
exit /b %ERRORLEVEL%
