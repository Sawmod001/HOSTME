@echo off
cd /d "C:\Users\PC\Desktop\HOSTME\HOSTME\hostme-app"
start /B npx next dev -p 3000 > server.log 2>&1
echo Server starting...
timeout /t 15 /nobreak >nul
type server.log | findstr -i "ready|error|compiled" 
