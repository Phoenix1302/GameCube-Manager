#!/usr/bin/env bash
# ==============================================================================
# GameCube-Manager - Uninstaller Script
# ==============================================================================
# Stops and removes systemd Quadlets and Podman containers.
# Leaves user downloads and Steam games intact.
# ==============================================================================

set -euo pipefail

CURRENT_USER="$(whoami)"
USER_HOME="${HOME:-/home/${CURRENT_USER}}"
QUADLET_DIR="${USER_HOME}/.config/containers/systemd"

echo "==> Stopping GameCube-Manager systemd service..."
systemctl --user stop gamecube-pod.service gamecube-web.service gamecube-torrent.service gamecube-proxy.service || true
systemctl --user disable gamecube-pod.service gamecube-web.service gamecube-torrent.service gamecube-proxy.service || true

echo "==> Removing Quadlets..."
rm -f "${QUADLET_DIR}/gamecube.pod" \
      "${QUADLET_DIR}/gamecube-web.container" \
      "${QUADLET_DIR}/gamecube-torrent.container" \
      "${QUADLET_DIR}/gamecube-proxy.container"

echo "==> Reloading systemd..."
systemctl --user daemon-reload

echo "==> Stopping and cleaning up any remaining Podman containers..."
if command -v podman >/dev/null 2>&1; then
    podman pod stop gamecube-pod 2>/dev/null || true
    podman pod rm -f gamecube-pod 2>/dev/null || true
    podman rm -f gamecube-web gamecube-torrent gamecube-proxy 2>/dev/null || true
fi

echo ""
echo "=========================================================================="
echo "  ✔ GameCube-Manager has been uninstalled."
echo "  (Your downloaded games in /mnt/game_data/Downloads and Steam library are preserved)"
echo "=========================================================================="
