Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("C:\Users\dingj\Documents\git\ai-dev-kit\solar-system-3d\shot3.png")
$w = $img.Width; $h = $img.Height
Write-Output "ImageSize: ${w}x${h}"
$bmp = New-Object System.Drawing.Bitmap($img)
$sx = 0.0; $sy = 0.0; $cnt = 0
for ($x = 0; $x -lt $w; $x += 2) {
  for ($y = 0; $y -lt $h; $y += 2) {
    $c = $bmp.GetPixel($x, $y)
    $r = [int]$c.R; $g = [int]$c.G; $b = [int]$c.B
    if ($r -gt 120 -and $g -gt 60 -and $b -lt 80 -and $r -gt $g -and $g -gt $b) {
      $sx += $x; $sy += $y; $cnt++
    }
  }
}
if ($cnt -gt 0) {
  $cx = $sx / $cnt; $cy = $sy / $cnt
  Write-Output ("OrangePixels: {0}" -f $cnt)
  Write-Output ("Centroid: ({0:N1}, {1:N1})  Xratio: {2:P1}  Yratio: {3:P1}" -f $cx, $cy, ($cx / $w), ($cy / $h))
} else { Write-Output "NoOrangePixels" }
$bmp.Dispose(); $img.Dispose()
