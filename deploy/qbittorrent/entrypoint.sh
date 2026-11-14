#!/bin/bash
set -e

CONFIG_DIR="/config/qBittorrent/config"
mkdir -p "${CONFIG_DIR}" "/downloads"

if [ ! -f "${CONFIG_DIR}/qBittorrent.conf" ]; then
    echo "[qBittorrent] Initializing default configuration in ${CONFIG_DIR}..."
    cp /defaults/qBittorrent.conf "${CONFIG_DIR}/qBittorrent.conf"
fi

WEBUI_PORT="${QBT_WEBUI_PORT:-8085}"
TORRENTING_PORT="${QBT_TORRENTING_PORT:-6882}"

echo "[qBittorrent] Starting qbittorrent-nox (WebUI port: ${WEBUI_PORT}, Torrenting port: ${TORRENTING_PORT})..."
exec qbittorrent-nox --confirm-legal-notice --profile=/config --webui-port="${WEBUI_PORT}" --torrenting-port="${TORRENTING_PORT}"
