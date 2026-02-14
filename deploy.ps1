param(
  [string]$AppDir = "C:\apps\gestao-igreja",
  [string]$Pm2Name = "gestao-igreja",
  [int]$Port = 3001
)

Set-Location $AppDir

Write-Host "==> Pull latest"
git fetch --all
git reset --hard origin/main

Write-Host "==> Install deps"
npm install --legacy-peer-deps

Write-Host "==> Build"
npm run build

Write-Host "==> Restart PM2"
pm2 restart $Pm2Name --update-env

Write-Host "==> Done"
pm2 ls
