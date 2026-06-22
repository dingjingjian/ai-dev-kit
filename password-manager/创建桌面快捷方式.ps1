$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$Shortcut = $WshShell.CreateShortcut("$DesktopPath\密码管理器.lnk")
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = """$PSScriptRoot\启动密码管理器.vbs"""
$Shortcut.WorkingDirectory = $PSScriptRoot
$Shortcut.Description = "本地密码管理器"
$Shortcut.Save()
