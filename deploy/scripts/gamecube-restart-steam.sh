#!/usr/bin/env bash
# ==============================================================================
# GameCube-Manager - Seamless SteamOS / Gamescope Restart Helper
# ==============================================================================
# Performs a soft, seamless restart of Steam inside Gamescope / Game Mode,
# preventing SDDM or display managers from dropping to the greeter login screen.
# ==============================================================================

set -uo pipefail

echo "[GameCube-Helper] Starting seamless Steam / Gamescope session reload..."

# 1. Determine active non-root desktop user
ACTIVE_USER="${SUDO_USER:-}"
if [ -z "$ACTIVE_USER" ] || [ "$ACTIVE_USER" = "root" ]; then
    ACTIVE_USER=$(who 2>/dev/null | awk '{print $1}' | head -n1 || true)
fi

if [ -z "$ACTIVE_USER" ] || [ "$ACTIVE_USER" = "root" ]; then
    if [ -d "/run/user" ]; then
        for u in /run/user/[0-9]*; do
            if [ -d "$u" ]; then
                uid_num=$(basename "$u")
                uid_name=$(id -nu "$uid_num" 2>/dev/null || true)
                if [ -n "$uid_name" ] && [ "$uid_name" != "root" ]; then
                    ACTIVE_USER="$uid_name"
                    break
                fi
            fi
        done
    fi
fi

if [ -z "$ACTIVE_USER" ] || [ "$ACTIVE_USER" = "root" ]; then
    if [ -d "/home/gamecube" ]; then
        ACTIVE_USER="gamecube"
    elif [ -d "/home/deck" ]; then
        ACTIVE_USER="deck"
    else
        ACTIVE_USER=$(ls -1 /home 2>/dev/null | head -n1 || echo "gamecube")
    fi
fi

ACTIVE_UID=$(id -u "$ACTIVE_USER" 2>/dev/null || echo "1000")
USER_HOME=$(eval echo "~$ACTIVE_USER")

echo "[GameCube-Helper] Target desktop user: ${ACTIVE_USER} (UID: ${ACTIVE_UID})"

export XDG_RUNTIME_DIR="/run/user/${ACTIVE_UID}"
export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${ACTIVE_UID}/bus"

# 2. Detect Gamescope Wayland/X11 session desktop file
GAMESCOPE_SESSION=""
for candidate in \
    "gamescope-wayland.desktop" \
    "gamescope-session.desktop" \
    "steam.desktop" \
    "steam-wayland.desktop" \
    "steamos.desktop" \
    "gamescope.desktop"; do
    if [ -f "/usr/share/wayland-sessions/${candidate}" ] || [ -f "/usr/share/xsessions/${candidate}" ]; then
        GAMESCOPE_SESSION="${candidate}"
        break
    fi
done

if [ -z "$GAMESCOPE_SESSION" ]; then
    GAMESCOPE_SESSION="gamescope-wayland.desktop"
fi

echo "[GameCube-Helper] Selected Gamescope session target: ${GAMESCOPE_SESSION}"

# 3. Configure SDDM autologin with Relogin=true to PREVENT GREETER on restart
# When Relogin=true is set, SDDM immediately logs back into the session on exit/restart
# instead of stopping at the login screen (greeter).
if [ -d "/etc/sddm.conf.d" ]; then
    mkdir -p "/etc/sddm.conf.d" 2>/dev/null || true
    cat << EOF > /etc/sddm.conf.d/zz-gamecube-session.conf 2>/dev/null || true
[Autologin]
User=${ACTIVE_USER}
Session=${GAMESCOPE_SESSION}
Relogin=true
EOF
    echo "[GameCube-Helper] Updated /etc/sddm.conf.d/zz-gamecube-session.conf (Relogin=true)"
fi

# Also update SDDM Last Session state so Gamescope is pre-selected as fallback
if [ -d "/var/lib/sddm" ]; then
    mkdir -p "/var/lib/sddm" 2>/dev/null || true
    SESSION_PATH="/usr/share/wayland-sessions/${GAMESCOPE_SESSION}"
    if [ ! -f "$SESSION_PATH" ]; then
        SESSION_PATH="/usr/share/xsessions/${GAMESCOPE_SESSION}"
    fi
    cat << EOF > /var/lib/sddm/state.conf 2>/dev/null || true
[Last]
Session=${SESSION_PATH}
User=${ACTIVE_USER}
EOF
    echo "[GameCube-Helper] Updated /var/lib/sddm/state.conf (Last Session: ${SESSION_PATH})"
fi

# 4. If steamos-session-select exists, ensure gamescope is configured
if command -v steamos-session-select >/dev/null 2>&1; then
    echo "[GameCube-Helper] Running steamos-session-select gamescope..."
    steamos-session-select gamescope 2>/dev/null || true
fi

# 5. Attempt graceful restart via user systemd units (SteamOS / Bazzite / ChimeraOS)
RESTARTED=false

for unit in \
    "gamescope-session.service" \
    "gamescope-session-steam.service" \
    "gamescope-session@steam.service" \
    "gamescope-session-plus.service" \
    "gamescope-session.target"; do
    if sudo -u "$ACTIVE_USER" env XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" systemctl --user is-active --quiet "$unit" 2>/dev/null; then
        echo "[GameCube-Helper] Restarting active systemd user unit: ${unit}..."
        sudo -u "$ACTIVE_USER" env XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" systemctl --user restart "$unit" 2>/dev/null || true
        RESTARTED=true
        break
    fi
done

# 6. If no active systemd unit caught it, gracefully restart Steam client
if [ "$RESTARTED" = false ]; then
    echo "[GameCube-Helper] Sending graceful shutdown signal to Steam client..."
    if [ "$(whoami)" = "$ACTIVE_USER" ]; then
        steam -shutdown 2>/dev/null || true
    else
        sudo -u "$ACTIVE_USER" steam -shutdown 2>/dev/null || true
    fi
    sleep 2
    # Ensure Steam terminates gently; SDDM Relogin=true will immediately restart Gamescope
    pkill -u "$ACTIVE_UID" -x steam 2>/dev/null || true
fi

echo "[GameCube-Helper] Seamless Steam / Gamescope session reload complete!"
exit 0
