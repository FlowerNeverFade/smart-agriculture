param(
    [string]$SdkRoot = 'D:\bearpi-hm_nano-build'
)

$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetRoot = Join-Path $SdkRoot 'applications\BearPi\BearPi-HM_Nano\sample\C2_e53_ia1_temp_humi_pls'
if (-not (Test-Path -LiteralPath $targetRoot -PathType Container)) {
    throw "BearPi SDK sample directory not found: $targetRoot"
}

Copy-Item -LiteralPath (Join-Path $sourceRoot 'e53_ia1_example.c') -Destination (Join-Path $targetRoot 'e53_ia1_example.c') -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'BUILD.gn') -Destination (Join-Path $targetRoot 'BUILD.gn') -Force
Write-Host "Remote actuator source deployed to $targetRoot"
