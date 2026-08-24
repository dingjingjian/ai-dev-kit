Add-Type -AssemblyName System.Drawing

# ─────────────────────────────────────────
# 配置
# ─────────────────────────────────────────
$size   = 512
$radius = 115                                          # 圆角半径
$cell   = 46                                           # 单颗豆子格距
$hues   = @(0, 28, 52, 120, 170, 215, 250, 285)        # 每行彩虹色相：红→紫

$heart = @(
  @(0,1,1,0,0,0,1,1,0),
  @(1,1,1,1,0,1,1,1,1),
  @(1,1,1,1,1,1,1,1,1),
  @(1,1,1,1,1,1,1,1,1),
  @(0,1,1,1,1,1,1,1,0),
  @(0,0,1,1,1,1,1,0,0),
  @(0,0,0,1,1,1,0,0,0),
  @(0,0,0,0,1,0,0,0,0)
)
$rows = $heart.Count
$cols = $heart[0].Count

# ─────────────────────────────────────────
# 工具函数
# ─────────────────────────────────────────
function HueToRgb($p, $q, $t) {
  if ($t -lt 0) { $t += 1 }
  if ($t -gt 1) { $t -= 1 }
  if ($t -lt 1/6) { return $p + ($q - $p) * 6 * $t }
  if ($t -lt 1/2) { return $q }
  if ($t -lt 2/3) { return $p + ($q - $p) * (2/3 - $t) * 6 }
  return $p
}

function HslToColor($h, $s, $l) {
  $hn = ((($h % 360) + 360) % 360) / 360
  if ($s -eq 0) {
    $v = [int]($l * 255)
    return [System.Drawing.Color]::FromArgb(255, $v, $v, $v)
  }
  $q = if ($l -lt 0.5) { $l * (1 + $s) } else { $l + $s - $l * $s }
  $p = 2 * $l - $q
  [System.Drawing.Color]::FromArgb(255,
    [int]((HueToRgb $p $q ($hn + 1/3)) * 255),
    [int]((HueToRgb $p $q $hn) * 255),
    [int]((HueToRgb $p $q ($hn - 1/3)) * 255))
}

function New-RoundRectPath($side, $r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc(0, 0, $d, $d, 180, 90)
  $p.AddArc($side-$d, 0, $d, $d, 270, 90)
  $p.AddArc($side-$d, $side-$d, $d, $d, 0, 90)
  $p.AddArc(0, $side-$d, $d, $d, 90, 90)
  $p.CloseFigure()
  $p
}

function Fill-RadialGlow($g, $region, $cx, $cy, $rad, $color) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse($cx-$rad, $cy-$rad, $rad*2, $rad*2)
  $brush = New-Object System.Drawing.Drawing2D.PathGradientBrush($path)
  $brush.CenterColor = $color
  $brush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $color.R, $color.G, $color.B))
  $g.FillPath($brush, $region)
  $brush.Dispose()
  $path.Dispose()
}

# ─────────────────────────────────────────
# 绘制
# ─────────────────────────────────────────
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

$bgPath = New-RoundRectPath $size $radius

# 1. 深色圆角底：对角渐变，衬托彩虹
$bgRect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
$bgTop = [System.Drawing.Color]::FromArgb(255, 44, 38, 70)
$bgBottom = [System.Drawing.Color]::FromArgb(255, 18, 14, 34)
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($bgRect, $bgTop, $bgBottom, [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal)
$g.FillPath($bgBrush, $bgPath)
$bgBrush.Dispose()

# 2. 环境光晕：呼应爱心两端的色彩，让背景与主体贴合
Fill-RadialGlow $g $bgPath ($size*0.30) ($size*0.28) 320 ([System.Drawing.Color]::FromArgb(72, 255, 90, 130))
Fill-RadialGlow $g $bgPath ($size*0.72) ($size*0.72) 320 ([System.Drawing.Color]::FromArgb(64, 90, 120, 255))
Fill-RadialGlow $g $bgPath ($size/2) ($size/2) 270 ([System.Drawing.Color]::FromArgb(48, 255, 255, 255))

# 3. 彩虹拼豆爱心
$ox = ($size - $cols * $cell) / 2
$oy = ($size - $rows * $cell) / 2 - 6
$beadR = $cell / 2 * 0.92

# 整团柔和投影
$shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(80, 0, 0, 0))
for ($y = 0; $y -lt $rows; $y++) {
  for ($x = 0; $x -lt $cols; $x++) {
    if ($heart[$y][$x] -eq 1) {
      $cx = $ox + $x * $cell + $cell / 2
      $cy = $oy + $y * $cell + $cell / 2
      $g.FillEllipse($shadowBrush, $cx-$beadR, $cy-$beadR+7, $beadR*2, $beadR*2)
    }
  }
}
$shadowBrush.Dispose()

# 豆体：暗边 + 主色 + 中心孔 + 左上高光
for ($y = 0; $y -lt $rows; $y++) {
  $hue = $hues[$y]
  $edgeBrush = New-Object System.Drawing.SolidBrush (HslToColor $hue 0.85 0.40)
  $mainBrush = New-Object System.Drawing.SolidBrush (HslToColor $hue 0.82 0.60)
  $holeBrush = New-Object System.Drawing.SolidBrush (HslToColor $hue 0.80 0.28)
  $hlBrush   = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(150, 255, 255, 255))

  for ($x = 0; $x -lt $cols; $x++) {
    if ($heart[$y][$x] -eq 1) {
      $cx = $ox + $x * $cell + $cell / 2
      $cy = $oy + $y * $cell + $cell / 2
      $g.FillEllipse($edgeBrush, $cx-$beadR, $cy-$beadR, $beadR*2, $beadR*2)
      $mR = $beadR * 0.90
      $off = $beadR * 0.06
      $g.FillEllipse($mainBrush, $cx-$mR-$off, $cy-$mR-$off, $mR*2, $mR*2)
      $hR = $beadR * 0.30
      $g.FillEllipse($holeBrush, $cx-$hR, $cy-$hR, $hR*2, $hR*2)
      $fR = $beadR * 0.17
      $fOff = $beadR * 0.36
      $g.FillEllipse($hlBrush, $cx-$fOff-$fR, $cy-$fOff-$fR, $fR*2, $fR*2)
    }
  }
  $edgeBrush.Dispose()
  $mainBrush.Dispose()
  $holeBrush.Dispose()
  $hlBrush.Dispose()
}

$bgPath.Dispose()
$g.Dispose()

$out = Join-Path $PSScriptRoot 'icon.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "图标已生成: $out"
