@echo off
schtasks /create /tn "PMServer" /tr "\"C:\Program Files\nodejs\node.exe\" \"C:\Users\ASUS\Documents\git\ai-dev-kit\password-manager\server.js\"" /sc once /st 00:00 /f
schtasks /run /tn "PMServer"
