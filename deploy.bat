@echo off
REM GitHub Actions(.github/workflows/deploy.yml)가 main push 시 이 스크립트를 그대로 실행한다.
REM origin은 SSH 배포 키로 인증한다(HTTPS+Credential Manager는 비대화형 세션에서 프롬프트가
REM 필요해 실패했었음) - C:\Users\shcpa8f\.ssh\config, samhwa_deploy_key 참고.
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
