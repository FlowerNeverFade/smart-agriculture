param(
  [int]$Port = 8080,
  [string]$Scenario = 'drought',
  [switch]$Build
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if ($Build) { .\gradlew.bat :apps:api-service:bootJar }
$env:SPRING_PROFILES_ACTIVE = 'standalone'
$env:APP_MODE = 'standalone'
$env:SERVER_PORT = "$Port"
java -jar "apps/api-service/build/libs/api-service-0.1.0.jar"
