Add-Type -AssemblyName System.Drawing
$size = 512
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# 背景：与工具主题一致的深色
$bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 30, 30, 46))
$g.FillRectangle($bg, 0, 0, $size, $size)

# 心形拼豆图案 8x8
$heart = @(
  @(0,1,1,0,0,1,1,0),
  @(1,1,1,1,1,1,1,1),
  @(1,1,1,1,1,1,1,1),
  @(1,1,1,1,1,1,1,1),
  @(0,1,1,1,1,1,1,0),
  @(0,0,1,1,1,1,0,0),
  @(0,0,0,1,1,0,0,0),
  @(0,0,0,0,0,0,0,0)
)
# 从上到下：大红 -> 淡粉 渐变
$rowColors = @('#FF0000','#E8465F','#FC6C85','#FF47A3','#FF69B4','#FF7BAC','#FFB6C1','#FFB6C1')

$gridSize = 8
$margin = 64
$cell = ($size - 2 * $margin) / $gridSize

function Clamp($v) { return [Math]::Max(0, [Math]::Min(255, $v)) }

for ($y=0; $y -lt $gridSize; $y++) {
  for ($x=0; $x -lt $gridSize; $x++) {
    if ($heart[$y][$x] -eq 1) {
      $cx = $margin + $x * $cell + $cell/2
      $cy = $margin + $y * $cell + $cell/2
      $r = $cell/2 * 0.86
      $hex = $rowColors[$y]
      $cr = [Convert]::ToInt32($hex.Substring(1,2),16)
      $cg = [Convert]::ToInt32($hex.Substring(3,2),16)
      $cb = [Convert]::ToInt32($hex.Substring(5,2),16)

      # 1. 暗底圆（边缘色）
      $darkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, (Clamp($cr-50)), (Clamp($cg-50)), (Clamp($cb-50))))
      $g.FillEllipse($darkBrush, [float]($cx-$r), [float]($cy-$r), [float](2*$r), [float](2*$r))

      # 2. 主色亮圆（偏左上模拟3D球体）
      $r2 = $r * 0.88
      $off = $r * 0.10
      $mainBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, (Clamp($cr+50)), (Clamp($cg+50)), (Clamp($cb+50))))
      $g.FillEllipse($mainBrush, [float]($cx-$r2-$off), [float]($cy-$r2-$off), [float](2*$r2), [float](2*$r2))

      # 3. 中心孔洞
      $hr = $r * 0.16
      $holeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, (Clamp($cr-70)), (Clamp($cg-70)), (Clamp($cb-70))))
      $g.FillEllipse($holeBrush, [float]($cx-$hr), [float]($cy-$hr), [float](2*$hr), [float](2*$hr))

      # 4. 左上高光点
      $hlR = $r * 0.20
      $hlOff = $r * 0.32
      $hlBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(140, 255, 255, 255))
      $g.FillEllipse($hlBrush, [float]($cx-$hlOff-$hlR), [float]($cy-$hlOff-$hlR), [float](2*$hlR), [float](2*$hlR))
    }
  }
}

$g.Dispose()
$out = 'C:\Users\ASUS\Documents\git\ai-dev-kit\perler-bead-designer\icon.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "图标已生成: $out"
