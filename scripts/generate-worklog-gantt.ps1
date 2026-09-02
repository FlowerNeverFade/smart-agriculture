param(
  [string]$OutputPath = "$(Join-Path (Get-Location) 'docs/figures/worklog-gantt.png')"
)

Add-Type -AssemblyName System.Drawing

function New-Font([string]$family, [float]$size, [System.Drawing.FontStyle]$style = [System.Drawing.FontStyle]::Regular) {
  return [System.Drawing.Font]::new($family, $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
}

function Draw-RoundedRectangle(
  [System.Drawing.Graphics]$Graphics,
  [System.Drawing.Brush]$Brush,
  [float]$X,
  [float]$Y,
  [float]$Width,
  [float]$Height,
  [float]$Radius
) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  $Graphics.FillPath($Brush, $path)
  $path.Dispose()
}

$width = 2400
$height = 1350
$left = 600
$timelineX = 660
$timelineWidth = 1680
$columnWidth = $timelineWidth / 12
$top = 218
$dateHeaderHeight = 58
$sectionHeight = 36
$rowHeight = 74
$fontFamily = 'Microsoft YaHei'

$sections = @(
  @{ name = '需求与架构'; color = '#3B82F6'; tasks = @(
      @{ name = '选题确认、分工与需求梳理'; owner = '全组'; start = 0; length = 2 },
      @{ name = '功能架构、技术架构与路线流程'; owner = '杨皓云 / 郑乐岩 / 刘晓航'; start = 0; length = 2 }
    ) },
  @{ name = '后端与智能能力'; color = '#22A06B'; tasks = @(
      @{ name = '模拟器、MQTT、API 与数据链路'; owner = '杨皓云 / 郑乐岩'; start = 0; length = 4 },
      @{ name = 'LLM/Agent 接入、安全策略、诊断与预测'; owner = '杨皓云 / 郑乐岩 / 刘晓航'; start = 2; length = 7 },
      @{ name = 'Crop Pack、知识库与健康评价'; owner = '郑乐岩'; start = 4; length = 5 }
    ) },
  @{ name = '前端与业务闭环'; color = '#F59E0B'; tasks = @(
      @{ name = '登录、主页面、3D 监测与视觉重构'; owner = '屈浩龙 / 吕硕 / 刘晓航'; start = 0; length = 6 },
      @{ name = '管理员工作台、系统管理、资源与规则'; owner = '屈浩龙 / 杨雨欣 / 刘晓航'; start = 3; length = 9 },
      @{ name = '农户端建议、灌溉、巡田与农智助手'; owner = '杨皓云 / 吕硕 / 杨雨欣'; start = 4; length = 8 }
    ) },
  @{ name = '测试与交付'; color = '#8B5CF6'; tasks = @(
      @{ name = '测试、缺陷修复与回归'; owner = '杨雨欣 / 全组'; start = 0; length = 12 },
      @{ name = '分支合并、部署与服务验收'; owner = '杨皓云 / 杨雨欣 / 全组'; start = 2; length = 10 },
      @{ name = '答辩材料与产品总结'; owner = '郑乐岩'; start = 9; length = 3 }
    ) }
)

$dates = @('8/21', '8/22', '8/23', '8/24', '8/25', '8/26', '8/27', '8/28', '8/29', '8/30', '8/31', '9/1')

$bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$graphics.Clear([System.Drawing.Color]::White)

$ink = [System.Drawing.ColorTranslator]::FromHtml('#16352A')
$muted = [System.Drawing.ColorTranslator]::FromHtml('#60756B')
$grid = [System.Drawing.ColorTranslator]::FromHtml('#DDE9E2')
$header = [System.Drawing.ColorTranslator]::FromHtml('#0F6B4F')
$headerLight = [System.Drawing.ColorTranslator]::FromHtml('#EAF5EF')
$rowAlt = [System.Drawing.ColorTranslator]::FromHtml('#F7FAF8')
$linePen = [System.Drawing.Pen]::new($grid, 1)
$headerBrush = [System.Drawing.SolidBrush]::new($header)
$inkBrush = [System.Drawing.SolidBrush]::new($ink)
$mutedBrush = [System.Drawing.SolidBrush]::new($muted)
$whiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
$headerLightBrush = [System.Drawing.SolidBrush]::new($headerLight)
$rowAltBrush = [System.Drawing.SolidBrush]::new($rowAlt)
$titleFont = New-Font $fontFamily 42 ([System.Drawing.FontStyle]::Bold)
$subtitleFont = New-Font $fontFamily 21
$dateFont = New-Font $fontFamily 18 ([System.Drawing.FontStyle]::Bold)
$sectionFont = New-Font $fontFamily 19 ([System.Drawing.FontStyle]::Bold)
$taskFont = New-Font $fontFamily 19
$ownerFont = New-Font $fontFamily 15
$legendFont = New-Font $fontFamily 16
$milestoneFont = New-Font $fontFamily 16 ([System.Drawing.FontStyle]::Bold)
$smallFont = New-Font $fontFamily 14

$graphics.DrawString('AgriLoop 工作日志概括甘特图', $titleFont, $inkBrush, 70, 52)
$graphics.DrawString('项目周期：2026/08/21—2026/09/01  ·  相近日志按阶段归并', $subtitleFont, $mutedBrush, 74, 120)

$graphics.FillRectangle($headerBrush, $timelineX, $top, $timelineWidth, $dateHeaderHeight)
$graphics.FillRectangle($headerBrush, 70, $top, $left - 70, $dateHeaderHeight)
$graphics.DrawString('工作阶段 / 主要任务', $dateFont, $whiteBrush, 92, $top + 18)
for ($i = 0; $i -lt $dates.Count; $i++) {
  $x = $timelineX + ($i * $columnWidth)
  $graphics.DrawString($dates[$i], $dateFont, $whiteBrush, $x + 42, $top + 18)
  if ($i -gt 0) { $graphics.DrawLine($linePen, $x, $top, $x, $top + $dateHeaderHeight) }
}

$currentY = $top + $dateHeaderHeight
$rowIndex = 0
foreach ($section in $sections) {
  $graphics.FillRectangle($headerLightBrush, 70, $currentY, $width - 140, $sectionHeight)
  $graphics.DrawString($section.name, $sectionFont, $inkBrush, 92, $currentY + 8)
  $graphics.DrawLine($linePen, 70, $currentY + $sectionHeight, $width - 70, $currentY + $sectionHeight)
  $currentY += $sectionHeight
  foreach ($task in $section.tasks) {
    if (($rowIndex % 2) -eq 1) { $graphics.FillRectangle($rowAltBrush, 70, $currentY, $width - 140, $rowHeight) }
    $graphics.DrawString($task.name, $taskFont, $inkBrush, 92, $currentY + 11)
    $graphics.DrawString($task.owner, $ownerFont, $mutedBrush, 92, $currentY + 42)
    $graphics.DrawLine($linePen, 70, $currentY + $rowHeight, $width - 70, $currentY + $rowHeight)
    for ($i = 0; $i -le 12; $i++) {
      $x = $timelineX + ($i * $columnWidth)
      $graphics.DrawLine($linePen, $x, $currentY, $x, $currentY + $rowHeight)
    }
    $barBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($section.color))
    $barX = $timelineX + ($task.start * $columnWidth) + 7
    $barY = $currentY + 20
    $barW = ($task.length * $columnWidth) - 14
    Draw-RoundedRectangle $graphics $barBrush $barX $barY $barW 34 10
    if ($barW -ge 260) {
      $barLabel = "$($dates[$task.start])—$($dates[$task.start + $task.length - 1])"
      $graphics.DrawString($barLabel, $smallFont, $whiteBrush, $barX + 12, $barY + 8)
    }
    $barBrush.Dispose()
    $currentY += $rowHeight
    $rowIndex++
  }
}

$milestoneY = $currentY + 28
$graphics.DrawString('关键里程碑', $sectionFont, $inkBrush, 92, $milestoneY + 4)
$milestones = @(
  @{ index = 7; label = '8/28 端到端闭环' },
  @{ index = 11; label = '9/1 最终合并与验收' }
)
foreach ($milestone in $milestones) {
  $cx = $timelineX + ($milestone.index * $columnWidth) + ($columnWidth / 2)
  $cy = $milestoneY + 18
  $diamondBrush = [System.Drawing.SolidBrush]::new($header)
  $points = @(
    [System.Drawing.PointF]::new($cx, $cy - 14),
    [System.Drawing.PointF]::new($cx + 14, $cy),
    [System.Drawing.PointF]::new($cx, $cy + 14),
    [System.Drawing.PointF]::new($cx - 14, $cy)
  )
  $graphics.FillPolygon($diamondBrush, $points)
  $diamondBrush.Dispose()
  $graphics.DrawString($milestone.label, $milestoneFont, $inkBrush, $cx - 72, $cy + 25)
}

$legendY = $height - 64
$graphics.DrawString('图例：', $legendFont, $mutedBrush, 74, $legendY + 5)
$legendItems = @(
  @{ label = '需求/架构'; color = '#3B82F6' },
  @{ label = '后端/智能'; color = '#22A06B' },
  @{ label = '前端/业务'; color = '#F59E0B' },
  @{ label = '测试/交付'; color = '#8B5CF6' }
)
$legendX = 150
foreach ($item in $legendItems) {
  $legendBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($item.color))
  Draw-RoundedRectangle $graphics $legendBrush $legendX $legendY 22 22 5
  $legendBrush.Dispose()
  $graphics.DrawString($item.label, $legendFont, $mutedBrush, $legendX + 32, $legendY + 2)
  $legendX += 190
}
$graphics.DrawString('注：条带表示工作日志覆盖区间，不等同于正式验收状态。', $legendFont, $mutedBrush, 1110, $legendY + 5)

$outputDirectory = Split-Path -Parent $OutputPath
if (-not (Test-Path $outputDirectory)) { New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null }
$bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

foreach ($resource in @($linePen, $headerBrush, $inkBrush, $mutedBrush, $whiteBrush, $headerLightBrush, $rowAltBrush, $titleFont, $subtitleFont, $dateFont, $sectionFont, $taskFont, $ownerFont, $legendFont, $milestoneFont, $smallFont, $graphics, $bitmap)) {
  if ($null -ne $resource) { $resource.Dispose() }
}

Write-Output $OutputPath
