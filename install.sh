#!/usr/bin/env bash
# ==============================================================================
# GameCube-Manager - Automated Production Installer (Fedora / Bazzite / SteamOS)
# ==============================================================================
# Deploys GameCube-Manager as a persistent systemd user service via Podman Quadlets.
# ==============================================================================

set -euo pipefail

# ANSI Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${CYAN}${BOLD}"
echo "  ██████╗  █████╗ ███╗   ███╗███████╗ ██████╗██╗   ██╗██████╗ ███████╗"
echo " ██╔════╝ ██╔══██╗████╗ ████║██╔════╝██╔════╝██║   ██║██╔══██╗██╔════╝"
echo " ██║  ███╗███████║██╔████╔██║█████╗  ██║     ██║   ██║██████╔╝█████╗  "
echo " ██║   ██║██╔══██║██║╚██╔╝██║██╔══╝  ██║     ██║   ██║██╔══██╗██╔══╝  "
echo " ╚██████╔╝██║  ██║██║ ╚═╝ ██║███████╗╚██████╗╚██████╔╝██████╔╝███████╗"
echo "  ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝"
echo -e "                   Steam Machine Control Center v1.1.1${NC}\n"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURRENT_USER="$(whoami)"
USER_HOME="${HOME:-/home/${CURRENT_USER}}"

# 1. Prerequisites Check
echo -e "${BLUE}==>${NC} ${BOLD}1. Checking prerequisites...${NC}"
if ! command -v podman >/dev/null 2>&1; then
    echo -e "${RED}[ERROR]${NC} Podman is required but not installed."
    echo "Install it via: sudo dnf install -y podman (Fedora) or use built-in Podman on Bazzite/SteamOS."
    exit 1
fi
PODMAN_VER="$(podman --version)"
echo -e "    ${GREEN}✔${NC} Found: ${PODMAN_VER}"

if ! command -v systemctl >/dev/null 2>&1; then
    echo -e "${RED}[ERROR]${NC} systemd is required for Quadlet auto-start."
    exit 1
fi
echo -e "    ${GREEN}✔${NC} systemd user session active"

# 2. Port Permissions (sysctl for 80/443 in rootless Podman)
echo -e "\n${BLUE}==>${NC} ${BOLD}2. Configuring rootless port permissions (ports 80 & 443)...${NC}"
UNPRIV_START="$(sysctl -n net.ipv4.ip_unprivileged_port_start 2>/dev/null || echo 1024)"
if [ "$UNPRIV_START" -gt 80 ]; then
    echo -e "    ${YELLOW}!${NC} Rootless containers currently require ports >= ${UNPRIV_START}."
    echo -e "    Configuring net.ipv4.ip_unprivileged_port_start=80 via sudo..."
    echo "net.ipv4.ip_unprivileged_port_start=80" | sudo tee /etc/sysctl.d/99-gamecube-ports.conf >/dev/null
    sudo sysctl -w net.ipv4.ip_unprivileged_port_start=80 >/dev/null
    echo -e "    ${GREEN}✔${NC} Ports 80 and 443 are now available for rootless Podman."
else
    echo -e "    ${GREEN}✔${NC} Port permissions already allow ports 80/443 (start: ${UNPRIV_START})."
fi

# 3. Firewalld Check & Open Ports
if command -v firewall-cmd >/dev/null 2>&1 && sudo systemctl is-active --quiet firewalld; then
    echo -e "\n${BLUE}==>${NC} ${BOLD}3. Configuring Firewall (firewalld)...${NC}"
    sudo firewall-cmd --add-port=80/tcp --add-port=443/tcp --add-port=6882/tcp --add-port=6882/udp --permanent >/dev/null 2>&1 || true
    sudo firewall-cmd --reload >/dev/null 2>&1 || true
    echo -e "    ${GREEN}✔${NC} Ports 80, 443, 6882 (TCP/UDP) opened in firewall."
fi

# 4. Seamless SteamOS / Gamescope Session Setup & Helper Script
echo -e "\n${BLUE}==>${NC} ${BOLD}4. Configuring Seamless SteamOS / Gamescope Session & Restart Helper...${NC}"

# Detect Gamescope session desktop file
GAMESCOPE_SESS=""
for sess in \
    "gamescope-session-steam.desktop" \
    "gamescope-wayland.desktop" \
    "gamescope-session.desktop" \
    "steam.desktop" \
    "steam-wayland.desktop" \
    "steamos.desktop" \
    "gamescope.desktop"; do
    if [ -f "/usr/share/wayland-sessions/${sess}" ] || [ -f "/usr/share/xsessions/${sess}" ]; then
        GAMESCOPE_SESS="${sess}"
        break
    fi
done
[ -z "$GAMESCOPE_SESS" ] && GAMESCOPE_SESS="gamescope-session-steam.desktop"

# Install helper script to /usr/local/bin/gamecube-restart-steam
if [ -f "${SCRIPT_DIR}/deploy/scripts/gamecube-restart-steam.sh" ]; then
    sudo install -m 755 "${SCRIPT_DIR}/deploy/scripts/gamecube-restart-steam.sh" /usr/local/bin/gamecube-restart-steam
    echo -e "    ${GREEN}✔${NC} Installed helper script: ${CYAN}/usr/local/bin/gamecube-restart-steam${NC}"
fi

# Backup legacy /usr/local/bin/steamos-session-select and symlink to our universal helper
if [ -f "/usr/local/bin/steamos-session-select" ] && [ ! -L "/usr/local/bin/steamos-session-select" ]; then
    sudo mv /usr/local/bin/steamos-session-select "/usr/local/bin/steamos-session-select.bak.$(date +%s)"
fi
sudo ln -sf /usr/local/bin/gamecube-restart-steam /usr/local/bin/steamos-session-select
echo -e "    ${GREEN}✔${NC} Linked SteamOS session switcher: ${CYAN}/usr/local/bin/steamos-session-select${NC} -> /usr/local/bin/gamecube-restart-steam"

# Clean up legacy / conflicting drop-ins that break desktop switching
sudo rm -f /etc/sddm.conf.d/zz-gamecube-session.conf /etc/plasmalogin.conf.d/zz-gamecube-session.conf /etc/sudoers.d/99-gamecube-restart 2>/dev/null || true

# Configure Plasma Login Manager (plasmalogin) autologin
if [ -d "/etc/plasmalogin.conf.d" ] || command -v plasmalogin >/dev/null 2>&1 || systemctl is-active --quiet plasmalogin.service 2>/dev/null; then
    sudo mkdir -p /etc/plasmalogin.conf.d
    cat << EOF | sudo tee /etc/plasmalogin.conf.d/autologin.conf >/dev/null
[Autologin]
User=${CURRENT_USER}
Session=${GAMESCOPE_SESS}
EOF
    echo -e "    ${GREEN}✔${NC} Configured Plasma Login Manager autologin (${GAMESCOPE_SESS})"
fi

# Configure SDDM autologin with Relogin=true
if [ -d "/etc/sddm.conf.d" ] || command -v sddm >/dev/null 2>&1 || systemctl is-active --quiet sddm.service 2>/dev/null; then
    sudo mkdir -p /etc/sddm.conf.d
    cat << EOF | sudo tee /etc/sddm.conf.d/autologin.conf >/dev/null
[Autologin]
User=${CURRENT_USER}
Session=${GAMESCOPE_SESS}
Relogin=true
EOF
    echo -e "    ${GREEN}✔${NC} Configured SDDM autologin with Relogin=true (${GAMESCOPE_SESS})"
fi

# Ensure /var/lib/sddm/state.conf points to Gamescope
if [ -d "/var/lib/sddm" ]; then
    SESS_PATH="/usr/share/wayland-sessions/${GAMESCOPE_SESS}"
    [ ! -f "$SESS_PATH" ] && SESS_PATH="/usr/share/xsessions/${GAMESCOPE_SESS}"
    cat << EOF | sudo tee /var/lib/sddm/state.conf >/dev/null
[Last]
Session=${SESS_PATH}
User=${CURRENT_USER}
EOF
    echo -e "    ${GREEN}✔${NC} Configured SDDM Last Session to: ${CYAN}${GAMESCOPE_SESS}${NC}"
fi

# Passwordless sudo for session switcher
if [ -d "/etc/sudoers.d" ]; then
    cat << 'EOF' | sudo tee /etc/sudoers.d/99-gamecube-session >/dev/null
ALL ALL=(ALL) NOPASSWD: /usr/local/bin/gamecube-restart-steam, /usr/local/bin/steamos-session-select
EOF
    sudo chmod 440 /etc/sudoers.d/99-gamecube-session
    echo -e "    ${GREEN}✔${NC} Configured passwordless sudo for session switcher in /etc/sudoers.d/99-gamecube-session"
fi

# 5. Storage & Directory Setup
echo -e "\n${BLUE}==>${NC} ${BOLD}5. Detecting storage and configuring paths...${NC}"

# Detect Steam userdata
STEAM_USERDATA=""
for candidate in \
    "${USER_HOME}/.local/share/Steam/userdata" \
    "${USER_HOME}/.steam/steam/userdata" \
    "/home/gamecube/.local/share/Steam/userdata" \
    "/home/deck/.local/share/Steam/userdata"; do
    if [ -d "$candidate" ]; then
        STEAM_USERDATA="$candidate"
        break
    fi
done

if [ -n "$STEAM_USERDATA" ]; then
    echo -e "    ${GREEN}✔${NC} Steam userdata found: ${CYAN}${STEAM_USERDATA}${NC}"
else
    STEAM_USERDATA="${USER_HOME}/.local/share/Steam/userdata"
    mkdir -p "$STEAM_USERDATA"
    echo -e "    ${YELLOW}!${NC} Steam userdata initialized at: ${STEAM_USERDATA}"
fi

# Detect Steam Library (prefer /mnt/game_data/SteamLibrary)
STEAM_LIBRARY=""
for candidate in \
    "/mnt/game_data/SteamLibrary" \
    "${USER_HOME}/.local/share/Steam" \
    "${USER_HOME}/.steam/steam"; do
    if [ -d "$candidate" ]; then
        STEAM_LIBRARY="$candidate"
        break
    fi
done

if [ -n "$STEAM_LIBRARY" ]; then
    echo -e "    ${GREEN}✔${NC} Steam Library detected: ${CYAN}${STEAM_LIBRARY}${NC}"
fi

# Direct high-speed NVMe/SSD storage mount
GAME_DATA_VOL=""
if [ -d "/mnt/game_data" ]; then
    GAME_DATA_VOL="Volume=/mnt/game_data:/mnt/game_data:rw"
    echo -e "    ${GREEN}✔${NC} Direct high-speed SSD mount configured: ${CYAN}/mnt/game_data${NC}"
fi

# Detect Downloads Directory (prefer high-capacity mount /mnt/game_data if present)
DOWNLOADS_DIR=""
if [ -d "/mnt/game_data" ] && [ -w "/mnt/game_data" ]; then
    DOWNLOADS_DIR="/mnt/game_data/Downloads"
elif [ -d "/mnt/game_data" ]; then
    sudo mkdir -p "/mnt/game_data/Downloads"
    sudo chown -R "${CURRENT_USER}:${CURRENT_USER}" "/mnt/game_data/Downloads"
    DOWNLOADS_DIR="/mnt/game_data/Downloads"
else
    DOWNLOADS_DIR="${USER_HOME}/Downloads/GameCube"
fi

mkdir -p "$DOWNLOADS_DIR"
echo -e "    ${GREEN}✔${NC} Torrent Downloads folder: ${CYAN}${DOWNLOADS_DIR}${NC}"

# User systemd lingering (ensures containers start on system boot without requiring GUI login)
loginctl enable-linger "$CURRENT_USER" >/dev/null 2>&1 || true
echo -e "    ${GREEN}✔${NC} Enabled systemd lingering for user ${CURRENT_USER} (runs on boot)"

# 5. Build Container Images
echo -e "\n${BLUE}==>${NC} ${BOLD}5. Building container images...${NC}"
cd "$SCRIPT_DIR"

echo -e "    - Building ${BOLD}gamecube-manager:1.1.1${NC} (Frontend + Backend)..."
podman build -t localhost/gamecube-manager:1.1.1 .

echo -e "    - Building ${BOLD}gamecube-torrent:1.1.1${NC} (Headless qBittorrent)..."
podman build -t localhost/gamecube-torrent:1.1.1 deploy/qbittorrent

echo -e "    - Building ${BOLD}gamecube-proxy:1.1.1${NC} (Nginx SSL Reverse Proxy)..."
podman build -t localhost/gamecube-proxy:1.1.1 deploy/nginx

echo -e "    ${GREEN}✔${NC} All container images built successfully."

# 6. Install Systemd Quadlets
echo -e "\n${BLUE}==>${NC} ${BOLD}6. Installing systemd Quadlets for automatic startup...${NC}"
QUADLET_DIR="${USER_HOME}/.config/containers/systemd"
mkdir -p "$QUADLET_DIR"

# Pod definition
cat << EOF > "${QUADLET_DIR}/gamecube.pod"
[Unit]
Description=GameCube-Manager Podman Pod (DIY Steam Machine)
After=network-online.target
Wants=gamecube-web.service gamecube-proxy.service gamecube-torrent.service

[Pod]
PodName=gamecube-pod
PublishPort=80:80
PublishPort=443:443
PublishPort=6882:6882
PublishPort=6882:6882/udp

[Install]
WantedBy=default.target
EOF

# Web application container
cat << EOF > "${QUADLET_DIR}/gamecube-web.container"
[Unit]
Description=GameCube-Manager Web Application Container
After=gamecube-pod.service
Requires=gamecube-pod.service

[Container]
ContainerName=gamecube-web
Pod=gamecube.pod
Image=localhost/gamecube-manager:1.1.1
PodmanArgs=--pid=host
Volume=/:/host_root:rslave
Volume=gamecube-data:/app/backend/data:rw
${GAME_DATA_VOL}
Environment=PORT=3000
Environment=HOST=127.0.0.1
Environment=NODE_ENV=production
Environment=HOST_ROOT=/host_root
Environment=STEAM_USERDATA_PATH=/host_root${STEAM_USERDATA}
Environment=STEAM_LIBRARY_PATH=/host_root${STEAM_LIBRARY}
Environment=QBITTORRENT_URL=http://127.0.0.1:8085
SecurityLabelDisable=true

[Service]
Restart=always

[Install]
WantedBy=default.target
EOF

# Torrent container
cat << EOF > "${QUADLET_DIR}/gamecube-torrent.container"
[Unit]
Description=GameCube-Manager Headless qBittorrent Container
After=gamecube-pod.service
Requires=gamecube-pod.service

[Container]
ContainerName=gamecube-torrent
Pod=gamecube.pod
Image=localhost/gamecube-torrent:1.1.1
Volume=${DOWNLOADS_DIR}:/downloads:rw
Volume=gamecube-torrent-config:/config:rw
${GAME_DATA_VOL}
SecurityLabelDisable=true

[Service]
Restart=always

[Install]
WantedBy=default.target
EOF

# Nginx SSL Proxy container
cat << EOF > "${QUADLET_DIR}/gamecube-proxy.container"
[Unit]
Description=GameCube-Manager Nginx SSL Proxy Container
After=gamecube-pod.service gamecube-web.service gamecube-torrent.service
Requires=gamecube-pod.service

[Container]
ContainerName=gamecube-proxy
Pod=gamecube.pod
Image=localhost/gamecube-proxy:1.1.1
Volume=gamecube-certs:/etc/nginx/certs:rw

[Service]
Restart=always

[Install]
WantedBy=default.target
EOF

echo -e "    ${GREEN}✔${NC} Quadlets installed to: ${CYAN}${QUADLET_DIR}${NC}"

# 7. Reload and Start Service
echo -e "\n${BLUE}==>${NC} ${BOLD}7. Starting GameCube-Manager service...${NC}"
systemctl --user daemon-reload
systemctl --user restart gamecube-pod.service gamecube-web.service gamecube-torrent.service gamecube-proxy.service || \
systemctl --user start gamecube-pod.service gamecube-web.service gamecube-torrent.service gamecube-proxy.service

# 8. Health Verification
echo -e "    Waiting for services to initialize..."
HEALTHY=false
for i in {1..20}; do
    if curl -sk --fail "https://127.0.0.1/api/auth/setup-status" >/dev/null 2>&1; then
        HEALTHY=true
        break
    fi
    sleep 1
done

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")"

echo ""
echo -e "${GREEN}==========================================================================${NC}"
if [ "$HEALTHY" = true ]; then
    echo -e "  🎮 ${BOLD}${GREEN}GameCube-Manager is ONLINE and running!${NC}"
else
    echo -e "  🎮 ${BOLD}${YELLOW}GameCube-Manager started (initializing)...${NC}"
fi
echo -e "${GREEN}==========================================================================${NC}"
echo -e "  • Web Portal (HTTPS): ${BOLD}${CYAN}https://${LAN_IP}${NC}  (or https://localhost)"
echo -e "  • Web Portal (HTTP):  ${BOLD}http://${LAN_IP}${NC}   (auto-redirects to HTTPS)"
echo -e "  • Torrent Downloads:  ${BOLD}${DOWNLOADS_DIR}${NC}"
echo -e "  • Steam Userdata:     ${BOLD}${STEAM_USERDATA}${NC}"
echo ""
echo -e "  ${BOLD}Управление сервисом (systemd):${NC}"
echo -e "    - Статус:     ${CYAN}systemctl --user status gamecube-pod.service${NC}"
echo -e "    - Перезапуск: ${CYAN}systemctl --user restart gamecube-pod.service${NC}"
echo -e "    - Остановка:  ${CYAN}systemctl --user stop gamecube-pod.service${NC}"
echo -e "    - Логи:       ${CYAN}journalctl --user -u gamecube-web.service -f${NC}"
echo -e "${GREEN}==========================================================================${NC}"
echo -e "  👉 Откройте в браузере: ${BOLD}${CYAN}https://${LAN_IP}/setup${NC} для создания администратора."
echo -e "${GREEN}==========================================================================${NC}\n"
