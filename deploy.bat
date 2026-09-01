@echo off
cd /d C:\project\samhwa

echo === Stopping SamhwaApp ===
call nssm.exe stop SamhwaApp

echo === git pull ===
call git pull origin main
if errorlevel 1 (
  echo git pull failed - restarting previous build
  call nssm.exe start SamhwaApp
  exit /b 1
)

echo === prisma generate ===
call npx prisma generate
if errorlevel 1 (
  echo prisma generate failed - restarting previous build
  call nssm.exe start SamhwaApp
  exit /b 1
)

echo === npm run build ===
call npm run build
if errorlevel 1 (
  echo build failed - restarting previous build
  call nssm.exe start SamhwaApp
  exit /b 1
)

echo === Starting SamhwaApp ===
call nssm.exe start SamhwaApp

echo === Deploy complete ===
