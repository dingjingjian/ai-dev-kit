Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d """ & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & """ && node server.js", 0, False
WScript.Sleep 2000
WshShell.Run "http://localhost:3000", 1, False
