Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('C:\Users\ASUS\Documents\小有可为-AI向善创新挑战赛\项目文档\06_社媒与传播\05_火箭发射\素材图\07_3D火箭效果.png')
Write-Host "Width: $($img.Width) Height: $($img.Height)"
$img.Dispose()
