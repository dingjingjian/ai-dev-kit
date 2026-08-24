Add-Type -AssemblyName System.Drawing

$size = 512
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

function Clamp($v) { [Math]::Max(0, [Math]::Min(255, $v)) }

function HexToColor($hex) {
  $r = [Convert]::ToInt32($hex.Substring(1,2),16)
  $gg = [Convert]::ToInt32($hex.Substring(3,2),16)
  $b = [Convert]::ToInt32($hex.Substring(5,2),16)
  [System.Drawing.Color]::FromArgb(255, $r, $gg, $b)
}

function Lighter($hex, $amount) {
  $c = HexToColor $hex
  [System.Drawing.Color]::FromArgb(255, (Clamp($c.R + $amount)), (Clamp($c.G + $amount)), (Clamp($c.B + $amount)))
}

function Darker($hex, $amount) {
  $c = HexToColor $hex
  [System.Drawing.Color]::FromArgb(255, (Clamp($c.R - $amount)), (Clamp($c.G - $amount)), (Clamp($c.B - $amount)))
}

# ─────────────────────────────────────────
# 1. 圆角方形 + 暖色径向渐变背景
# ─────────────────────────────────────────
$radius = 96
$bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$bgPath.AddArc(0, 0, $radius*2, $radius*2, 180, 90)
$bgPath.AddArc($size-$radius*2, 0, $radius*2, $radius*2, 270, 90)
$bgPath.AddArc($size-$radius*2, $size-$radius*2, $radius*2, $radius*2, 0, 90)
$bgPath.AddArc(0, $size-$radius*2, $radius*2, $radius*2, 90, 90)
$bgPath.CloseFigure()

# 暖色线性渐变（左上奶油 → 右下蜜桃粉）
$bgRect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $bgRect,
  [System.Drawing.Color]::FromArgb(255, 255, 240, 220),   # 左上 #FFF0DC
  [System.Drawing.Color]::FromArgb(255, 255, 200, 200),   # 右下 #FFC8C8
  [System.Drawing.Drawing2D.LinearGradientMode]::Diagonal
)
$g.FillPath($bgBrush, $bgPath)
$bgBrush.Dispose()

# 暖色径向高光（左上角提亮，让画面更立体）
$glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$glowPath.AddEllipse(-120, -120, 380, 380)
$glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
$glowBrush.CenterColor = [System.Drawing.Color]::FromArgb(120, 255, 255, 255)
$glowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 240, 220))
$g.FillPath($glowBrush, $bgPath)
$glowBrush.Dispose()
$glowPath.Dispose()

# ─────────────────────────────────────────
# 2. 散落的装饰豆（4 颗彩色小豆，打破单调）
# ─────────────────────────────────────────
function DrawBead($cx, $cy, $r, $hex, $opacity) {
  if ($opacity -lt 255) {
    $darkBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($opacity, (Darker $hex 50).R, (Darker $hex 50).G, (Darker $hex 50).B))
    $g.FillEllipse($darkBrush, $cx-$r, $cy-$r+3, $r*2, $r*2)
    $darkBrush.Dispose()
    $mainBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($opacity, (Lighter $hex 25).R, (Lighter $hex 25).G, (Lighter $hex 25).B))
    $g.FillEllipse($mainBrush, $cx-$r*0.88-$r*0.1, $cy-$r*0.88-$r*0.1, $r*1.76, $r*1.76)
    $mainBrush.Dispose()
    $hlBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb([Math]::Min(255, $opacity+30), 255, 255, 255))
    $g.FillEllipse($hlBrush, $cx-$r*0.52, $cy-$r*0.52, $r*0.44, $r*0.44)
    $hlBrush.Dispose()
  } else {
    $darkBrush = New-Object System.Drawing.SolidBrush (Darker $hex 50)
    $g.FillEllipse($darkBrush, $cx-$r, $cy-$r+3, $r*2, $r*2)
    $darkBrush.Dispose()
    $mainR = $r * 0.88
    $off = $r * 0.10
    $mainBrush = New-Object System.Drawing.SolidBrush (Lighter $hex 25)
    $g.FillEllipse($mainBrush, $cx-$mainR-$off, $cy-$mainR-$off, $mainR*2, $mainR*2)
    $mainBrush.Dispose()
    $hr = $r * 0.18
    $holeBrush = New-Object System.Drawing.SolidBrush (Darker $hex 70)
    $g.FillEllipse($holeBrush, $cx-$hr, $cy-$hr, $hr*2, $hr*2)
    $holeBrush.Dispose()
    $hlR = $r * 0.22
    $hlOff = $r * 0.30
    $hlBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(180, 255, 255, 255))
    $g.FillEllipse($hlBrush, $cx-$hlOff-$hlR, $cy-$hlOff-$hlR, $hlR*2, $hlR*2)
    $hlBrush.Dispose()
  }
}

# 4 颗散落装饰豆（黄 / 绿 / 蓝 / 粉），使用圆角剪裁避免溢出
$deco = @(
  @{ x=60;  y=92;  r=18; hex='#FFD93D'; op=255 },
  @{ x=452; y=104; r=16; hex='#A6E3A1'; op=255 },
  @{ x=72;  y=420; r=16; hex='#89B4FA'; op=255 },
  @{ x=444; y=408; r=18; hex='#FFB5A7'; op=255 }
)
# 装饰豆被剪裁到圆角内
$stateSave = $g.Save()
$g.SetClip($bgPath)
foreach ($d in $deco) { DrawBead $d.x $d.y $d.r $d.hex $d.op }
$g.Restore($stateSave)

# ─────────────────────────────────────────
# 3. 心形拼豆图案 12×12（带可爱脸）
# ─────────────────────────────────────────
$heart = @(
  @(0,0,1,1,1,0,0,1,1,1,0,0),
  @(0,1,1,1,1,1,0,1,1,1,1,0),
  @(1,1,1,1,1,1,1,1,1,1,1,1),
  @(1,1,1,1,1,1,1,1,1,1,1,1),
  @(1,1,1,1,1,1,1,1,1,1,1,1),
  @(1,1,1,1,1,1,1,1,1,1,1,1),
  @(0,1,1,1,1,1,1,1,1,1,1,0),
  @(0,0,1,1,1,1,1,1,1,1,0,0),
  @(0,0,0,1,1,1,1,1,1,0,0,0),
  @(0,0,0,0,1,1,1,1,0,0,0,0),
  @(0,0,0,0,0,1,1,0,0,0,0,0),
  @(0,0,0,0,0,0,0,0,0,0,0,0)
)

# 心形主色渐变：12 行从大红渐变到蜜桃
$heartColors = @(
  '#FF5252','#FF5252',
  '#FF6B6B','#FF7B7B',
  '#FF8B8B','#FF9B9B',
  '#FFABAB','#FFB5A7',
  '#FFBFB8','#FFC9C0',
  '#FFD0BB','#FFD0BB'
)

$gridSize = 12
$margin = 80
$cell = ($size - 2 * $margin) / $gridSize

# 脸谱坐标（眼睛位置 3,3 / 8,3；腮红 2,5 / 9,5；嘴 5,6 / 6,6）
$eyePositions   = @(@(3,3), @(8,3))
$cheekPositions = @(@(2,5), @(9,5))
$mouthPositions = @(@(5,6), @(6,6))

# 整团心形阴影（柔和）
$shadowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
for ($y=0; $y -lt $gridSize; $y++) {
  for ($x=0; $x -lt $gridSize; $x++) {
    if ($heart[$y][$x] -eq 1) {
      $cx = $margin + $x * $cell + $cell/2
      $cy = $margin + $y * $cell + $cell/2
      $r = $cell/2 * 0.88
      $shadowPath.AddEllipse($cx-$r, $cy-$r+8, $r*2, $r*2)
    }
  }
}
$shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(50, 200, 110, 110))
$g.FillPath($shadowBrush, $shadowPath)
$shadowBrush.Dispose()
$shadowPath.Dispose()

# 绘制每颗拼豆
function DrawHeartBead($x, $y, $hex, $isEye, $isCheek, $isMouth) {
  $cx = $margin + $x * $cell + $cell/2
  $cy = $margin + $y * $cell + $cell/2
  $r = $cell/2 * 0.88

  # 暗底
  $darkBrush = New-Object System.Drawing.SolidBrush (Darker $hex 55)
  $g.FillEllipse($darkBrush, $cx-$r, $cy-$r, $r*2, $r*2)
  $darkBrush.Dispose()

  # 主色亮圆（偏左上模拟 3D 球体）
  $mainR = $r * 0.88
  $off = $r * 0.10
  $mainBrush = New-Object System.Drawing.SolidBrush (Lighter $hex 35)
  $g.FillEllipse($mainBrush, $cx-$mainR-$off, $cy-$mainR-$off, $mainR*2, $mainR*2)
  $mainBrush.Dispose()

  # 中心孔
  $hr = $r * 0.18
  $holeColor = Darker $hex 75
  $holeBrush = New-Object System.Drawing.SolidBrush $holeColor
  $g.FillEllipse($holeBrush, $cx-$hr, $cy-$hr, $hr*2, $hr*2)
  $holeBrush.Dispose()

  # 左上高光
  $hlR = $r * 0.22
  $hlOff = $r * 0.30
  $hlBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(170, 255, 255, 255))
  $g.FillEllipse($hlBrush, $cx-$hlOff-$hlR, $cy-$hlOff-$hlR, $hlR*2, $hlR*2)
  $hlBrush.Dispose()
}

# 脸谱：实心圆 + 高光，独立于豆体（不被中心孔吞掉）
function DrawFaceFeature($x, $y, $hex, $isEye, $isCheek) {
  $cx = $margin + $x * $cell + $cell/2
  $cy = $margin + $y * $cell + $cell/2
  # 比正常豆略小，留出边
  $r = $cell/2 * 0.62

  # 软阴影
  $shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70, 0, 0, 0))
  $g.FillEllipse($shadowBrush, $cx-$r*0.95, $cy-$r*0.95+2, $r*1.9, $r*1.9)
  $shadowBrush.Dispose()

  # 主色
  $mainBrush = New-Object System.Drawing.SolidBrush (HexToColor $hex)
  $g.FillEllipse($mainBrush, $cx-$r, $cy-$r, $r*2, $r*2)
  $mainBrush.Dispose()

  if ($isEye) {
    # 眼睛高光（左上小白点）
    $hlR = $r * 0.30
    $hlBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(240, 255, 255, 255))
    $g.FillEllipse($hlBrush, $cx-$r*0.40-$hlR, $cy-$r*0.40-$hlR, $hlR*2, $hlR*2)
    $hlBrush.Dispose()
  }
}

for ($y=0; $y -lt $gridSize; $y++) {
  for ($x=0; $x -lt $gridSize; $x++) {
    if ($heart[$y][$x] -eq 1) {
      $isEye = $false
      $isCheek = $false
      $isMouth = $false
      $faceHex = $null
      foreach ($e in $eyePositions)   { if ($e[0] -eq $x -and $e[1] -eq $y) { $isEye = $true;   $faceHex = '#2A1F26' } }
      foreach ($c in $cheekPositions) { if ($c[0] -eq $x -and $c[1] -eq $y) { $isCheek = $true; $faceHex = '#FF6B8A' } }
      foreach ($m in $mouthPositions) { if ($m[0] -eq $x -and $m[1] -eq $y) { $isMouth = $true;  $faceHex = '#A04848' } }

      if ($isEye -or $isCheek -or $isMouth) {
        DrawFaceFeature $x $y $faceHex $isEye $isCheek
      } else {
        $hex = $heartColors[$y]
        DrawHeartBead $x $y $hex $false $false $false
      }
    }
  }
}

# ─────────────────────────────────────────
# 4. 右上 / 左下 sparkle 装饰（小亮点）
# ─────────────────────────────────────────
function DrawSparkle($cx, $cy, $r) {
  $pts = @()
  for ($i=0; $i -lt 4; $i++) {
    $angle = $i * 90
    $pts += [System.Drawing.PointF]::new(
      [float]($cx + $r * [Math]::Cos($angle * [Math]::PI / 180)),
      [float]($cy + $r * [Math]::Sin($angle * [Math]::PI / 180))
    )
  }
  $sparkleBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(220, 255, 255, 255))
  $g.FillEllipse($sparkleBrush, $cx-$r*0.4, $cy-$r, $r*0.8, $r*2)
  $g.FillEllipse($sparkleBrush, $cx-$r, $cy-$r*0.4, $r*2, $r*0.8)
  $sparkleBrush.Dispose()
}

# 4 颗小星花
$stateSave = $g.Save()
$g.SetClip($bgPath)
DrawSparkle 180 70 10
DrawSparkle 380 180 8
DrawSparkle 130 350 7
DrawSparkle 400 320 9
$g.Restore($stateSave)

# ─────────────────────────────────────────
# 5. 顶部细高光弧线（增加玻璃质感，可选）
# ─────────────────────────────────────────

# ─────────────────────────────────────────
# 保存
# ─────────────────────────────────────────
$bgPath.Dispose()
$g.Dispose()
$out = 'C:\Users\ASUS\Documents\git\ai-dev-kit\perler-bead-designer\icon.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "图标已生成: $out"
