# PowerShell Script to start GameCube-Manager Podman Pod
$ErrorActionPreference = "Stop"

$podName = "gamecube-pod"
$httpPort = if ($env:HTTP_PORT) { $env:HTTP_PORT } else { "80" }
$httpsPort = if ($env:HTTPS_PORT) { $env:HTTPS_PORT } else { "443" }

Write-Host "==> Checking existing pod '$podName'..." -ForegroundColor Cyan
$existing = podman pod ls --format "{{.Name}}" | Where-Object { $_ -eq $podName }
if ($existing) {
    Write-Host "==> Removing existing pod '$podName'..." -ForegroundColor Yellow
    podman pod rm -f $podName | Out-Null
}

Write-Host "==> Creating Podman Pod '$podName' (HTTP: $httpPort, HTTPS: $httpsPort)..." -ForegroundColor Cyan
podman pod create --name $podName -p "${httpPort}:80" -p "${httpsPort}:443"

Write-Host "==> Starting Web Application on internal localhost:3000..." -ForegroundColor Cyan
podman run -d `
    --name gamecube-web `
    --pod $podName `
    --restart=always `
    -e PORT=3000 `
    -e HOST=127.0.0.1 `
    -e NODE_ENV=production `
    -e HOST_ROOT=/host_root `
    -e QBITTORRENT_URL=http://127.0.0.1:8085 `
    localhost/gamecube-manager:1.0.1

Write-Host "==> Starting Headless qBittorrent Container (Internal WebUI 8085 / Peer 6882)..." -ForegroundColor Cyan
podman run -d `
    --name gamecube-torrent `
    --pod $podName `
    --restart=always `
    localhost/gamecube-torrent:1.0.0

Write-Host "==> Starting Nginx SSL Proxy..." -ForegroundColor Cyan
podman run -d `
    --name gamecube-proxy `
    --pod $podName `
    --restart=always `
    localhost/gamecube-proxy:1.0.0

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host "  🎮 GameCube-Manager Pod successfully started!" -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host "  HTTPS: https://localhost:$httpsPort" -ForegroundColor Yellow
Write-Host "  HTTP:  http://localhost:$httpPort (redirects to HTTPS)" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Architecture:" -ForegroundColor White
Write-Host "    - Outside Network   --> Nginx Proxy (Port $httpsPort SSL / Port $httpPort)" -ForegroundColor Gray
Write-Host "    - Inside Podman Pod --> Web Application (127.0.0.1:3000 strictly)" -ForegroundColor Gray
Write-Host "==========================================================================" -ForegroundColor Green
