#!/usr/bin/env bash
# ==============================================================================
# GameCube-Manager - Podman Pod Deployment Script (Fedora / Bazzite / SteamOS)
# ==============================================================================
# Deploys GameCube-Manager, Headless qBittorrent, and Nginx SSL Reverse Proxy
# inside a shared, isolated Podman Pod.
# ==============================================================================

set -euo pipefail

POD_NAME="gamecube-pod"
WEB_CONTAINER="gamecube-web"
PROXY_CONTAINER="gamecube-proxy"
TORRENT_CONTAINER="gamecube-torrent"

# Ports
HTTP_PORT="${HTTP_PORT:-80}"
HTTPS_PORT="${HTTPS_PORT:-443}"
TORRENT_PORT="${TORRENT_PORT:-6882}"

# Auto-detect Steam userdata path on host
STEAM_USERDATA_PATH="${STEAM_USERDATA_PATH:-}"
if [ -z "$STEAM_USERDATA_PATH" ]; then
    if [ -d "${HOME}/.local/share/Steam/userdata" ]; then
        STEAM_USERDATA_PATH="/host_root${HOME}/.local/share/Steam/userdata"
    elif [ -d "/home/gamecube/.local/share/Steam/userdata" ]; then
        STEAM_USERDATA_PATH="/host_root/home/gamecube/.local/share/Steam/userdata"
    elif [ -d "/home/deck/.local/share/Steam/userdata" ]; then
        STEAM_USERDATA_PATH="/host_root/home/deck/.local/share/Steam/userdata"
    else
        STEAM_USERDATA_PATH="/host_root${HOME}/.local/share/Steam/userdata"
    fi
fi

# Auto-detect game downloads path on host (prefers fast secondary disk if mounted)
DOWNLOADS_DIR="${DOWNLOADS_DIR:-}"
if [ -z "$DOWNLOADS_DIR" ]; then
    if [ -d "/mnt/game_data" ] && [ -w "/mnt/game_data" ]; then
        mkdir -p "/mnt/game_data/Downloads"
        DOWNLOADS_DIR="/mnt/game_data/Downloads"
    else
        mkdir -p "${HOME}/Downloads"
        DOWNLOADS_DIR="${HOME}/Downloads"
    fi
fi

echo "==> Deploying GameCube-Manager Podman Pod..."
echo "    - HTTP Port:      ${HTTP_PORT}"
echo "    - HTTPS Port:     ${HTTPS_PORT}"
echo "    - Torrent Port:   ${TORRENT_PORT} (TCP/UDP)"
echo "    - Steam Userdata: ${STEAM_USERDATA_PATH}"
echo "    - Downloads Dir:  ${DOWNLOADS_DIR}"

# Stop and remove existing pod if running
if podman pod exists "${POD_NAME}"; then
    echo "==> Stopping and removing existing pod '${POD_NAME}'..."
    podman pod stop "${POD_NAME}" || true
    podman pod rm -f "${POD_NAME}" || true
fi

# Create named volumes for data persistence if not existing
podman volume create gamecube-data >/dev/null 2>&1 || true
podman volume create gamecube-certs >/dev/null 2>&1 || true
podman volume create gamecube-torrent-config >/dev/null 2>&1 || true

# 1. Create shared Pod with published external ports
echo "==> Creating Podman Pod '${POD_NAME}'..."
podman pod create \
    --name "${POD_NAME}" \
    -p "${HTTP_PORT}:80" \
    -p "${HTTPS_PORT}:443" \
    -p "${TORRENT_PORT}:6882" \
    -p "${TORRENT_PORT}:6882/udp"

# 2. Run GameCube-Manager Web Application inside the Pod
# Note: NO direct port publishing! Only accessible on localhost:3000 inside the pod.
echo "==> Starting web application container '${WEB_CONTAINER}'..."
podman run -d \
    --name "${WEB_CONTAINER}" \
    --pod "${POD_NAME}" \
    --restart=always \
    --security-opt label=disable \
    -v "/:/host_root:rslave" \
    -v "gamecube-data:/app/backend/data:rw" \
    -e PORT=3000 \
    -e HOST=127.0.0.1 \
    -e NODE_ENV=production \
    -e HOST_ROOT=/host_root \
    -e STEAM_USERDATA_PATH="${STEAM_USERDATA_PATH}" \
    -e QBITTORRENT_URL=http://127.0.0.1:8085 \
    localhost/gamecube-manager:1.1.1

# 3. Run Headless qBittorrent inside the Pod
echo "==> Starting Headless qBittorrent container '${TORRENT_CONTAINER}'..."
podman run -d \
    --name "${TORRENT_CONTAINER}" \
    --pod "${POD_NAME}" \
    --restart=always \
    --security-opt label=disable \
    -v "${DOWNLOADS_DIR}:/downloads:rw" \
    -v "gamecube-torrent-config:/config:rw" \
    localhost/gamecube-torrent:1.1.1

# 4. Run Nginx Reverse Proxy with SSL inside the Pod
echo "==> Starting Nginx SSL proxy container '${PROXY_CONTAINER}'..."
podman run -d \
    --name "${PROXY_CONTAINER}" \
    --pod "${POD_NAME}" \
    --restart=always \
    -v "gamecube-certs:/etc/nginx/certs:rw" \
    localhost/gamecube-proxy:1.1.1

LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo ""
echo "=========================================================================="
echo "  🎮 GameCube-Manager Pod is up and running!"
echo "=========================================================================="
echo "  Web UI (HTTPS): https://${LAN_IP}:${HTTPS_PORT} (or https://localhost:${HTTPS_PORT})"
echo "  Web UI (HTTP):  http://${LAN_IP}:${HTTP_PORT} (auto-redirects to HTTPS)"
echo "  qBittorrent:    Managed internally via Web UI (proxied at /qbittorrent/)"
echo "  Downloads:      ${DOWNLOADS_DIR}"
echo "=========================================================================="
