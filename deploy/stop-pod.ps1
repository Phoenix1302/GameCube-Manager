# PowerShell Script to stop GameCube-Manager Podman Pod
$podName = "gamecube-pod"

$existing = podman pod ls --format "{{.Name}}" | Where-Object { $_ -eq $podName }
if ($existing) {
    Write-Host "Stopping and removing pod '$podName'..." -ForegroundColor Yellow
    podman pod rm -f $podName
    Write-Host "Pod '$podName' successfully stopped and removed." -ForegroundColor Green
} else {
    Write-Host "Pod '$podName' is not running." -ForegroundColor Gray
}
