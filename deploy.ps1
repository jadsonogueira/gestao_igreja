param(
  [string]$AppDir = "C:\apps\gestao-igreja",
  [string]$Pm2Name = "gestao-igreja"
)

Set-Location $AppDir

Write-Host "==> Pull latest (hard sync with origin/main)"
git fetch origin
git reset --hard origin/main
git clean -fd

Write-Host "==> Install deps"
npm install --legacy-peer-deps

Write-Host "==> Prisma generate"
npx prisma generate

Write-Host "==> Build"
npm run build

Write-Host "==> Start/Reload via PM2 ecosystem"
pm2 startOrReload ecosystem.config.cjs --update-env

Write-Host "==> Save PM2 process list"
pm2 save

Write-Host "==> Done"
pm2 ls