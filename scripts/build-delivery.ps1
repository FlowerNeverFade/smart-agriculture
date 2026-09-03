[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$SkipTests,
    [switch]$KeepStaging
)

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$submissionRoot = Join-Path (Split-Path $repoRoot -Parent) '项目提交清单'
$deliveryRoot = Join-Path $submissionRoot '3.各端源码、数据库文件、可执行的包文件、部署文档、开发文档'
$workRoot = Join-Path $repoRoot '.delivery-work'
$zipHelper = Join-Path $repoRoot 'scripts/zip-with-unix-modes.py'
$version = '0.1.0'

function Write-Utf8NoBom([string]$Path, [string]$Content) {
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Invoke-Checked([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory) {
    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "命令执行失败 ($LASTEXITCODE): $FilePath $($Arguments -join ' ')"
        }
    } finally {
        Pop-Location
    }
}

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "未找到必要命令: $Name"
    }
}

function Copy-TreeContents([string]$Source, [string]$Destination) {
    New-Item -ItemType Directory -Force $Destination | Out-Null
    Get-ChildItem -LiteralPath $Source -Force | Copy-Item -Destination $Destination -Recurse -Force
}

function New-Zip([string]$ArchiveRoot, [string]$OutputPath) {
    Invoke-Checked 'python' @($zipHelper, $ArchiveRoot, $OutputPath) $repoRoot
}

function Assert-ZipDoesNotContain([string]$ZipPath, [string[]]$Patterns) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        foreach ($entry in $archive.Entries) {
            $name = $entry.FullName.Replace('\', '/')
            foreach ($pattern in $Patterns) {
                if ($name -match $pattern) {
                    throw "归档包含禁止内容 '$name': $ZipPath"
                }
            }
        }
    } finally {
        $archive.Dispose()
    }
}

Require-Command 'python'
if (-not $SkipBuild) {
    Require-Command 'npm'
    Write-Host '[1/7] 构建并回归前端'
    Invoke-Checked 'npm' @('ci') (Join-Path $repoRoot 'apps/web-ui')
    if (-not $SkipTests) {
        Invoke-Checked 'npm' @('test') (Join-Path $repoRoot 'apps/web-ui')
    }
    Invoke-Checked 'npm' @('run', 'build') (Join-Path $repoRoot 'apps/web-ui')

    Write-Host '[2/7] 编译、测试并打包后端'
    $gradleArgs = @(':apps:api-service:compileJava', ':apps:api-service:compileTestJava')
    if (-not $SkipTests) { $gradleArgs += ':apps:api-service:test' }
    $gradleArgs += @(':apps:api-service:bootJar', '--no-daemon', '-Duser.timezone=UTC')
    Invoke-Checked (Join-Path $repoRoot 'gradlew.bat') $gradleArgs $repoRoot

    if (-not $SkipTests) {
        Write-Host '[3/7] 执行硬件/模拟器与微信端检查'
        Invoke-Checked 'python' @('-m', 'pytest', 'hardware', 'simulator') $repoRoot
        Invoke-Checked 'node' @('scripts/check-wechat-mini-program.mjs') $repoRoot
    }
} else {
    Write-Host '[1-3/7] 已按参数跳过构建与测试'
}

$jar = Join-Path $repoRoot "apps/api-service/build/libs/api-service-$version.jar"
$webDist = Join-Path $repoRoot 'apps/web-ui/dist'
if (-not (Test-Path -LiteralPath $jar)) { throw "缺少可执行 JAR: $jar" }
if (-not (Test-Path -LiteralPath (Join-Path $webDist 'index.html'))) { throw "缺少 Vite 构建目录: $webDist" }

Write-Host '[4/7] 生成数据库、源码和 Linux 发布包暂存目录'
if (Test-Path -LiteralPath $workRoot) { Remove-Item -LiteralPath $workRoot -Recurse -Force }
New-Item -ItemType Directory -Force $workRoot | Out-Null
$releaseArchiveRoot = Join-Path $workRoot 'release-archive'
$releaseStage = Join-Path $releaseArchiveRoot "agriloop-release-linux-x86_64"
$sourceArchiveRoot = Join-Path $workRoot 'source-archive'
$sourceStage = Join-Path $sourceArchiveRoot 'agriloop-source'
$totalStage = Join-Path $workRoot 'total-archive'
New-Item -ItemType Directory -Force $releaseStage, $sourceStage, $totalStage | Out-Null

New-Item -ItemType Directory -Force (Join-Path $releaseStage 'api'), (Join-Path $releaseStage 'web'), (Join-Path $releaseStage 'db/migrations') | Out-Null
Copy-Item -LiteralPath $jar -Destination (Join-Path $releaseStage 'api/api-service-0.1.0.jar') -Force
Copy-TreeContents $webDist (Join-Path $releaseStage 'web')
Copy-Item -Path (Join-Path $repoRoot 'database/migrations/V*.sql') -Destination (Join-Path $releaseStage 'db/migrations') -Force
Copy-Item -LiteralPath (Join-Path $repoRoot 'database/demo-seed.sql') -Destination (Join-Path $releaseStage 'db/demo-seed.sql') -Force
Copy-TreeContents (Join-Path $repoRoot 'packaging/release/bin') (Join-Path $releaseStage 'bin')
Copy-TreeContents (Join-Path $repoRoot 'packaging/release/config') (Join-Path $releaseStage 'config')
Copy-Item -LiteralPath (Join-Path $repoRoot 'packaging/release/.dockerignore') -Destination (Join-Path $releaseStage '.dockerignore') -Force
$buildTime = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$manifest = (Get-Content -LiteralPath (Join-Path $repoRoot 'packaging/release/release-manifest.json') -Raw).Replace('__BUILD_TIME__', $buildTime)
Write-Utf8NoBom (Join-Path $releaseStage 'release-manifest.json') $manifest
Copy-Item -LiteralPath (Join-Path $repoRoot 'packaging/release/README.md') -Destination (Join-Path $releaseStage 'README.md') -Force

# Build the source archive from files on disk so newly split, uncommitted
# classes are included.  Generated data and secrets are excluded explicitly.
$excludedDirectoryNames = @('.git', '.gradle', 'node_modules', 'build', 'dist', 'data', 'logs', 'backups', 'artifacts', '.venv', '__pycache__', '.pytest_cache', '.delivery-work', 'output', '.arts', '.tools', 'acceptance', 'figures', 'delivery')
$excludedFileNames = @(
    '01_智慧农业_基本功能清单.md',
    '02_智慧农业_功能架构.md',
    '03_智慧农业_技术架构.md',
    '04_智慧农业_大致路线与流程.md',
    'AGENTS.md',
    'FIX_RECORDS.md',
    'PROJECT_STATUS.md',
    'SAU_MERGE_REPORT.md',
    'TASKS.md',
    'design-qa.md',
    'BACKEND_TASKS.md',
    'admin-interface-freeze.md',
    'project-limitations-roadmap.md',
    'HANDOFF_2026-08-27_设备接入与Agent.md',
    'HANDOFF_2026-08-28_资源分配与风险推演重构.md'
)
$excludedFilePatterns = @(
    '(^|/|\\)\.env($|\.)',
    '\.(onnx|safetensors|gguf|pt|pth|ckpt|bin)$',
    '\.zip$|\.jar$|\.class$|\.pyc$'
)
Get-ChildItem -LiteralPath $repoRoot -Recurse -File -Force | ForEach-Object {
    $relative = $_.FullName.Substring($repoRoot.Length).TrimStart('\', '/')
    $parts = $relative -split '\\|/'
    if ($parts | Where-Object { $excludedDirectoryNames -contains $_ }) { return }
    if ($excludedFileNames -contains $_.Name) { return }
    if ($excludedFilePatterns | Where-Object { $relative -match $_ }) { return }
    $destination = Join-Path $sourceStage $relative
    New-Item -ItemType Directory -Force (Split-Path $destination -Parent) | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
}

$outputSourceDir = Join-Path $deliveryRoot '01-各端源码'
$outputDbDir = Join-Path $deliveryRoot '02-数据库文件'
$outputReleaseDir = Join-Path $deliveryRoot '03-项目发布包'
$outputDeployDir = Join-Path $deliveryRoot '04-部署文档'
$outputDevDir = Join-Path $deliveryRoot '05-开发文档'
New-Item -ItemType Directory -Force $outputSourceDir, $outputDbDir, $outputReleaseDir, $outputDeployDir, $outputDevDir | Out-Null

Write-Host '[5/7] 创建交付 ZIP 和数据库副本'
$sourceZip = Join-Path $outputSourceDir 'agriloop-source.zip'
$releaseZip = Join-Path $outputReleaseDir 'agriloop-release-linux-x86_64.zip'
New-Zip $sourceArchiveRoot $sourceZip
New-Zip $releaseArchiveRoot $releaseZip
New-Item -ItemType Directory -Force (Join-Path $outputDbDir 'migrations') | Out-Null
Copy-Item -Path (Join-Path $repoRoot 'database/migrations/V*.sql') -Destination (Join-Path $outputDbDir 'migrations') -Force
Copy-Item -LiteralPath (Join-Path $repoRoot 'database/demo-seed.sql') -Destination (Join-Path $outputDbDir 'demo-seed.sql') -Force
Copy-Item -LiteralPath (Join-Path $repoRoot 'database/README.md') -Destination (Join-Path $outputDbDir 'README.md') -Force
$releaseHash = (Get-FileHash -LiteralPath $releaseZip -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Utf8NoBom (Join-Path $outputReleaseDir 'SHA256SUMS.txt') "$releaseHash  agriloop-release-linux-x86_64.zip`n"

Write-Host '[6/7] 复制正式部署文档和开发文档'
Copy-Item -LiteralPath (Join-Path $repoRoot 'docs/delivery/部署文档.md') -Destination $outputDeployDir -Force
Copy-Item -LiteralPath (Join-Path $repoRoot 'docs/delivery/开发文档.md') -Destination $outputDevDir -Force

# The total archive contains the named delivery directories and files, but not
# itself.  This keeps extraction deterministic and prevents recursive growth.
Get-ChildItem -LiteralPath $deliveryRoot -Force | Where-Object { $_.Name -ne '农智闭环-项目交付总包.zip' } | Copy-Item -Destination $totalStage -Recurse -Force
$totalZip = Join-Path $deliveryRoot '农智闭环-项目交付总包.zip'
New-Zip $totalStage $totalZip

Write-Host '[7/7] 检查归档禁入项和迁移副本一致性'
$sourceForbidden = @('(^|/)\.git(/|$)', '(^|/)node_modules(/|$)', '(^|/)\.gradle(/|$)', '(^|/)build(/|$)', '(^|/)dist(/|$)', '(^|/)data(/|$)', '(^|/)logs(/|$)', '(^|/)backups(/|$)', '(^|/)\.env($|\.)', '\.(jar|class)$', '\.(onnx|safetensors|gguf|pt|pth|ckpt|bin)$')
$releaseForbidden = @('(^|/)\.git(/|$)', '(^|/)node_modules(/|$)', '(^|/)\.gradle(/|$)', '(^|/)build(/|$)', '(^|/)dist(/|$)', '(^|/)\.env($|\.)', '\.(java|class)$', '\.(onnx|safetensors|gguf|pt|pth|ckpt)$', '(^|/)(logs|backups|data)(/|$)')
Assert-ZipDoesNotContain $sourceZip $sourceForbidden
Assert-ZipDoesNotContain $releaseZip $releaseForbidden
foreach ($migration in Get-ChildItem (Join-Path $repoRoot 'apps/api-service/src/main/resources/db/migration/V*.sql')) {
    $copy = Join-Path (Join-Path $outputDbDir 'migrations') $migration.Name
    if ((Get-FileHash $migration.FullName -Algorithm SHA256).Hash -ne (Get-FileHash $copy -Algorithm SHA256).Hash) {
        throw "迁移副本不一致: $($migration.Name)"
    }
}
if (-not (Test-Path -LiteralPath $totalZip)) { throw "未生成总交付包: $totalZip" }

if (-not $KeepStaging) { Remove-Item -LiteralPath $workRoot -Recurse -Force }
Write-Host "交付材料已生成: $deliveryRoot"
Write-Host "发布包 SHA-256: $releaseHash"
